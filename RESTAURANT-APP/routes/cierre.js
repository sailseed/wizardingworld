const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Middleware de seguridad (Contraseña diferente)
const adminAuth = (req, res, next) => {
    if (req.session.isAdmin) return next();
    res.render('cierre/login');
};

router.get('/login', (req, res) => res.render('cierre/login'));

router.post('/login', (req, res) => {
    if (req.body.password === 'Tesla27') {
        req.session.isAdmin = true;
        res.redirect('/cierre');
    } else {
        res.send("Acceso Denegado. <a href='/cierre/login'>Volver</a>");
    }
});

// Logout al salir al dashboard
router.get('/logout', (req, res) => {
    req.session.isAdmin = false;
    res.redirect('/');
});

// Pantalla Principal de Cierre
router.get('/', adminAuth, (req, res) => {
    // Buscar si hay una sesión abierta
    req.db.get("SELECT * FROM sesiones WHERE status = 'open'", (err, activeSession) => {
        if (!activeSession) {
            // Si no hay sesión, mostrar historial de cerradas y botón de abrir
            req.db.all("SELECT * FROM sesiones WHERE status = 'closed' ORDER BY id DESC", (err, history) => {
                res.render('cierre/main', { activeSession: null, history });
            });
        } else {
            // Si hay sesión, cargar movimientos (Fondo, Ventas, Gastos)
            const sId = activeSession.id;
            const data = {};

            req.db.all("SELECT * FROM fondos WHERE session_id = ?", [sId], (err, fondos) => {
                req.db.all("SELECT * FROM servicios WHERE status = 'closed' AND session_id = ?", [sId], (err, ventas) => {
                    req.db.all("SELECT * FROM gastos WHERE session_id = ?", [sId], (err, gastos) => {
                        res.render('cierre/main', {
                            activeSession,
                            fondos,
                            ventas,
                            gastos
                        });
                    });
                });
            });
        }
    });
});

// Abrir Sesión
router.post('/abrir', adminAuth, (req, res) => {
    req.db.get("SELECT MAX(id) as lastId FROM sesiones", (err, row) => {
        const nextNum = (row ? (row.lastId || 0) : 0) + 1;
        const session_code = "#S" + String(nextNum).padStart(4, '0');

        // TIMESTAMP LOCAL
        const now = new Date();
        const ts = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + " " + String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');

        req.db.run("INSERT INTO sesiones (session_code, start_timestamp) VALUES (?, ?)",
                   [session_code, ts], function() {
                       res.redirect('/cierre/fondo-prompt/' + this.lastID);
                   });
    });
});

// Prompt de Fondo
router.get('/fondo-prompt/:id', adminAuth, (req, res) => {
    res.render('cierre/fondo', { sessionId: req.params.id });
});

router.post('/fondo-save/:id', adminAuth, (req, res) => {
    const amount = req.body.amount || 0;
    const now = new Date();
    const ts = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + " " +
    String(now.getHours()).padStart(2, '0') + ":" +
    String(now.getMinutes()).padStart(2, '0');

    req.db.get("SELECT COUNT(*) as count FROM fondos", (err, row) => {
        const f_code = "#F" + String(row.count + 1).padStart(4, '0');
        req.db.run("INSERT INTO fondos (session_id, f_code, amount, timestamp) VALUES (?, ?, ?, ?)",
        [req.params.id, f_code, amount, ts], () => res.redirect('/cierre'));
    });
});


// RUTA PARA DESCARGAR REPORTES ANTIGUOS
router.get('/reporte/:id', adminAuth, (req, res) => {
    const sId = req.params.id;

    // 1. Obtenemos el código de la sesión para el nombre del archivo
    req.db.get("SELECT session_code FROM sesiones WHERE id = ?", [sId], (err, session) => {
        if (!session) return res.status(404).send("Sesión no encontrada");

        // 2. Recolectamos la data (igual que en el cierre)
        req.db.all("SELECT f_code as ID, 'Fondo' as Tipo, amount as Monto, timestamp as Fecha, '' as Info FROM fondos WHERE session_id = ?", [sId], (err, f) => {
            req.db.all("SELECT service_code as ID, 'Venta' as Tipo, total as Monto, timestamp as Fecha, payment_method as Info FROM servicios WHERE session_id = ?", [sId], (err, v) => {
                req.db.all("SELECT g_code as ID, 'Gasto' as Tipo, -price as Monto, timestamp as Fecha, description as Info FROM gastos WHERE session_id = ?", [sId], (err, g) => {

                    const reportData = [...(f || []), ...(v || []), ...(g || [])];

                    // 3. Generamos el Excel en memoria
                    const ws = XLSX.utils.json_to_sheet(reportData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Reporte");

                    // En lugar de escribirlo en disco, lo enviamos directamente al navegador
                    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

                    // Configuramos las cabeceras de descarga
                    res.setHeader('Content-Disposition', `attachment; filename=Reporte_${session.session_code.replace('#', '')}.xlsx`);
                    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

                    res.send(buffer);
                });
            });
        });
    });
});

// CERRAR SESIÓN Y EXPORTAR EXCEL

// Cerrar Sesión
router.post('/cerrar/:id', adminAuth, (req, res) => {
    const sId = req.params.id;
    const now = new Date();
    const tsEnd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + " " + String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');

    // 1. Recolectar toda la data para el Excel
    req.db.all("SELECT f_code as ID, 'Fondo' as Tipo, amount as Monto, timestamp as Fecha, '' as Info FROM fondos WHERE session_id = ?", [sId], (err, f) => {
        req.db.all("SELECT service_code as ID, 'Venta' as Tipo, total as Monto, timestamp as Fecha, payment_method as Info FROM servicios WHERE session_id = ?", [sId], (err, v) => {
            req.db.all("SELECT g_code as ID, 'Gasto' as Tipo, -price as Monto, timestamp as Fecha, description as Info FROM gastos WHERE session_id = ?", [sId], (err, g) => {

                const reportData = [...f, ...v, ...g];

                // 2. Crear Excel
                const ws = XLSX.utils.json_to_sheet(reportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Cierre");
                const dir = path.join('public', 'reportes');

                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                const fileName = `Reporte_${sId}_${Date.now()}.xlsx`;
                XLSX.writeFile(wb, path.join(dir, fileName));

                // 3. Cerrar sesión en DB
                req.db.run("UPDATE sesiones SET status = 'closed', end_timestamp = ? WHERE id = ?", [tsEnd, sId], () => {
                    req.session.isAdmin = false;
                    res.redirect('/');
                });
            });
        });
    });
});

module.exports = router;
