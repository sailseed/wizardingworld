const express = require('express');
const { imprimirTicket, imprimirReciboCliente } = require('../utils/printer');
const router = express.Router();

// 1. Home - List all tables
router.get('/', (req, res) => {
    req.db.all("SELECT * FROM mesas", [], (err, tables) => {
        req.db.all("SELECT * FROM servicios WHERE status = 'active'", [], (err, services) => {
            res.render('mesas/index', { tables, services });
        });
    });
});

// 2.a Add New Regular Table
router.post('/add', (req, res) => {
    req.db.run("INSERT INTO mesas (name, type) VALUES (?, 'regular')", [req.body.name], () => res.redirect('/mesas'));
});

// 2b Remove table
router.post('/delete/:id', (req, res) => {
    req.db.run("DELETE FROM mesas WHERE id = ? AND type = 'regular'", [req.params.id], (err) => {
        res.redirect('/mesas');
    });
});

// 3. Open Account (Abrir Cuenta)
router.post('/open/:mesaId', (req, res) => {
    const mesaId = req.params.mesaId;
    const { domicilio } = req.body;

    req.db.get("SELECT * FROM mesas WHERE id = ?", [mesaId], (err, mesa) => {
        let codePrefix = "#M";
        let customCode = null;

        if (mesa.type === 'recoleccion') codePrefix = "#R";
        if (mesa.type === 'envio') customCode = "#" + domicilio.replace(/\s+/g, '');

        if (customCode) {
            req.db.run("INSERT INTO servicios (service_code, mesa_id, status, domicilio) VALUES (?, ?, 'active', ?)",
                       [customCode, mesaId, domicilio], () => res.redirect('/mesas'));
        } else {
            req.db.get("SELECT COUNT(*) as count FROM servicios WHERE service_code LIKE ?", [codePrefix + '%'], (err, row) => {
                const service_code = codePrefix + String(row.count + 1).padStart(4, '0');
                req.db.run("INSERT INTO servicios (service_code, mesa_id, status) VALUES (?, ?, 'active')",
                           [service_code, mesaId], () => res.redirect('/mesas'));
            });
        }
    });
});

// 4. View Service (The Order Page)
router.get('/service/:id', (req, res) => {
    const serviceId = req.params.id;
    req.db.get("SELECT servicios.*, mesas.name as mesa_name, mesas.type as mesa_type FROM servicios JOIN mesas ON servicios.mesa_id = mesas.id WHERE servicios.id = ?", [serviceId], (err, service) => {
        req.db.all("SELECT * FROM pedidos WHERE service_id = ?", [serviceId], (err, items) => {
            req.db.all("SELECT * FROM menu", (err, menu) => {
                res.render('mesas/order', { service, items, menu, printRequired: req.query.printRequired === '1' });
            });
        });
    });
});

// RUTA CORREGIDA: Toggle Pagado
router.post('/service/:id/toggle-pagado', (req, res) => {
    const newVal = req.body.pagado ? 1 : 0;
    const serviceId = req.params.id;

    req.db.run("UPDATE servicios SET pagado = ? WHERE id = ?", [newVal, serviceId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error en la base de datos");
        }
        res.redirect(`/mesas/service/${serviceId}`);
    });
});

// 5. Add Item to Order
router.post('/add-item/:serviceId', (req, res) => {
    const { menu_item_id, quantity, comment } = req.body;
    req.db.get("SELECT * FROM menu WHERE id = ?", [menu_item_id], (err, item) => {
        req.db.run("INSERT INTO pedidos (service_id, menu_item_id, name, price, quantity, comment) VALUES (?, ?, ?, ?, ?, ?)",
                   [req.params.serviceId, item.id, item.name, item.price, quantity, comment], () => {
                       res.redirect('/mesas/service/' + req.params.serviceId);
                   });
    });
});

// 6. Enviar a Cocina
router.post('/send-to-kitchen/:serviceId', (req, res) => {
    const serviceId = req.params.serviceId;
    const now = Date.now();

    // Primero obtenemos la información del servicio y los items que se van a enviar
    const queryService = `
    SELECT s.*, m.name as mesa_name, m.type as mesa_type
    FROM servicios s
    JOIN mesas m ON s.mesa_id = m.id
    WHERE s.id = ?`;

    const queryItems = "SELECT * FROM pedidos WHERE service_id = ? AND enviado = 0";

    req.db.get(queryService, [serviceId], (err, servicio) => {
        req.db.all(queryItems, [serviceId], (err, items) => {

            if (items.length > 0) {
                // SI ES ENVÍO O RECOLECCIÓN, MANDAR A IMPRIMIR
                if (servicio.mesa_type === 'envio' || servicio.mesa_type === 'recoleccion') {
                    imprimirTicket(servicio, items);
                }

                // Marcar como enviado en la DB para la cocina
                req.db.run("UPDATE pedidos SET enviado = 1, kitchen_time = ? WHERE service_id = ? AND enviado = 0",
                           [now, serviceId], () => {
                               res.redirect('/mesas/service/' + serviceId);
                           });
            } else {
                res.redirect('/mesas/service/' + serviceId);
            }
        });
    });
});

// 6.b Imprimir recibo antes de elegir método de pago
router.post('/print-receipt/:serviceId', (req, res) => {
    const serviceId = req.params.serviceId;

    req.db.get("SELECT s.*, m.name as mesa_name, m.type as mesa_type FROM servicios s JOIN mesas m ON s.mesa_id = m.id WHERE s.id = ?", [serviceId], (err, servicio) => {
        if (err || !servicio) {
            console.error("Error al obtener servicio para imprimir:", err);
            return res.redirect('/mesas/service/' + serviceId);
        }

        req.db.all("SELECT * FROM pedidos WHERE service_id = ?", [serviceId], (itemsErr, items) => {
            if (itemsErr) {
                console.error("Error al obtener items para imprimir:", itemsErr);
                return res.redirect('/mesas/service/' + serviceId);
            }

            if (servicio.mesa_type !== 'regular') {
                return res.redirect('/mesas/service/' + serviceId);
            }

            try {
                imprimirReciboCliente(servicio, items);
            } catch (printErr) {
                console.error("Error al imprimir recibo preliminar:", printErr);
            }

            req.db.run("UPDATE servicios SET customer_ticket_printed = 1 WHERE id = ?", [serviceId], (updateErr) => {
                if (updateErr) {
                    console.error("Error marcando ticket impreso:", updateErr.message);
                }
                res.redirect('/mesas/service/' + serviceId);
            });
        });
    });
});

// 7. Cerrar Cuenta (Finalize) y Imprimir Recibo
router.post('/close/:serviceId', (req, res) => {
    const serviceId = req.params.serviceId;
    const { payment_method, total } = req.body;

    const now = new Date();
    const ts = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + " " +
    String(now.getHours()).padStart(2, '0') + ":" +
    String(now.getMinutes()).padStart(2, '0');

    console.log(`Intentando cerrar servicio ID: ${serviceId}`);

    // 1. Obtenemos información de la mesa
    req.db.get("SELECT s.*, m.name as mesa_name, m.type as mesa_type FROM servicios s JOIN mesas m ON s.mesa_id = m.id WHERE s.id = ?", [serviceId], (err, servicio) => {
        if (err) return console.error("Error al obtener servicio:", err);

        if (!servicio) {
            return res.redirect('/mesas/service/' + serviceId + '?printRequired=1');
        }

        const requiresPrintedTicket = servicio.mesa_type === 'regular';
        if (requiresPrintedTicket && servicio.customer_ticket_printed !== 1) {
            return res.redirect('/mesas/service/' + serviceId + '?printRequired=1');
        }

        // 2. Obtenemos pedidos para el ticket
        req.db.all("SELECT * FROM pedidos WHERE service_id = ?", [serviceId], (err, items) => {
            if (err) return console.error("Error al obtener items:", err);

            // 3. Buscamos sesión de cierre activa
            req.db.get("SELECT id FROM sesiones WHERE status = 'open'", (err, session) => {
                const sId = session ? session.id : 'NA';

                // 4. Cerramos en la base de datos
                const sql = "UPDATE servicios SET status = 'closed', payment_method = ?, total = ?, timestamp = ?, session_id = ? WHERE id = ?";
                const params = [payment_method, total, ts, sId, serviceId];

                req.db.run(sql, params, function(err) {
                    if (err) {
                        console.error("ERROR CRÍTICO AL ACTUALIZAR DB:", err.message);
                        return res.status(500).send("Error al cerrar la cuenta en la base de datos: " + err.message);
                    }

                    console.log(`Servicio ${serviceId} cerrado con éxito. Filas afectadas: ${this.changes}`);
                    res.redirect('/mesas');
                });
            });
        });
    });
});

// HISTORIAL DE VENTAS (Cerradas)
router.get('/historial', (req, res) => {
    const query = `
    SELECT servicios.*, mesas.name as mesa_name
    FROM servicios
    JOIN mesas ON servicios.mesa_id = mesas.id
    WHERE servicios.status = 'closed'
    ORDER BY servicios.id DESC
    `;

    req.db.all(query, [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error al cargar el historial");
        }
        res.render('mesas/historial', { history: rows || [] });
    });
});

module.exports = router;
