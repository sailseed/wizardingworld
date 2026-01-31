const express = require('express');
const router = express.Router();

// Monitor de Cocina - Ver pedidos (FIFO: El más viejo primero)
router.get('/', (req, res) => {
    const query = `
    SELECT p.*, s.service_code, m.name as mesa_name
    FROM pedidos p
    JOIN servicios s ON p.service_id = s.id
    JOIN mesas m ON s.mesa_id = m.id
    WHERE p.enviado = 1 AND p.preparado = 0
    ORDER BY p.id ASC
    `;

    req.db.all(query, [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error en la base de datos");
        }

        const ticketsMap = {};

        rows.forEach(row => {
            if (!ticketsMap[row.service_id]) {
                ticketsMap[row.service_id] = {
                    service_id: row.service_id,
                    service_code: row.service_code,
                    mesa_name: row.mesa_name,
                    first_item_id: row.id, // Para ordenar por antigüedad
                    items: []
                };
            }
            ticketsMap[row.service_id].items.push(row);
        });

        // Convertir a array y ordenar explícitamente (FIFO)
        let allTickets = Object.values(ticketsMap);
        allTickets.sort((a, b) => a.first_item_id - b.first_item_id);

        const displayTickets = allTickets.slice(0, 4);
        const queueCount = Math.max(0, allTickets.length - 4);

        res.render('cocina/index', { displayTickets, queueCount });
    });
});

// Marcar ticket como preparado
router.post('/preparar/:serviceId', (req, res) => {
    req.db.run("UPDATE pedidos SET preparado = 1 WHERE service_id = ? AND enviado = 1",
               [req.params.serviceId], (err) => {
                   if (err) console.error(err);
                   res.redirect('/cocina');
               });
});

module.exports = router; // Esta línea es vital para que app.js lo reconozca
