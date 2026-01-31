const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuración de Multer para fotos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const authRequired = (req, res, next) => {
    if (req.session.isLogged) return next();
    res.render('gastos/login');
};

router.get('/login', (req, res) => res.render('gastos/login'));
router.post('/login', (req, res) => {
    if (req.body.password === 'Chocolate23!') {
        req.session.isLogged = true;
        res.redirect('/gastos');
    } else {
        res.send("Password Incorrecto. <a href='/gastos/login'>Reintentar</a>");
    }
});

// Reemplaza el router.get('/') en routes/gastos.js
router.get('/', authRequired, (req, res) => {
    // Usamos un LEFT JOIN para traer el código de la sesión si existe
    const query = `
    SELECT gastos.*, sesiones.session_code
    FROM gastos
    LEFT JOIN sesiones ON gastos.session_id = sesiones.id
    ORDER BY gastos.id DESC
    `;

    req.db.all(query, [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error en la base de datos");
        }
        res.render('gastos/index', { items: rows });
    });
});

router.get('/agregar', authRequired, (req, res) => {
    req.db.get("SELECT MAX(id) as lastId FROM gastos", (err, row) => {
        const nextNum = (row.lastId || 0) + 1;
        const g_code = "#G" + String(nextNum).padStart(4, '0');
        res.render('gastos/add', { g_code });
    });
});

router.post('/agregar', authRequired, upload.single('receipt'), (req, res) => {
    const { g_code, description, price } = req.body;
    const receipt_img = req.file ? req.file.filename : null;

    const now = new Date();
    const ts = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + " " + String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');

    // BUSCAMOS SI HAY SESIÓN DE CIERRE ABIERTA
    req.db.get("SELECT id FROM sesiones WHERE status = 'open'", (err, session) => {
        const sId = session ? session.id : 'NA';
        req.db.run("INSERT INTO gastos (g_code, timestamp, description, price, session_id, receipt_img) VALUES (?, ?, ?, ?, ?, ?)",
                   [g_code, ts, description, price, sId, receipt_img], () => {
                       res.redirect('/gastos');
                   });
    });
});

router.get('/edit/:id', authRequired, (req, res) => {
    req.db.get("SELECT * FROM gastos WHERE id = ?", [req.params.id], (err, row) => {
        res.render('gastos/edit', { item: row });
    });
});

router.post('/edit/:id', authRequired, (req, res) => {
    const { description, price } = req.body;
    req.db.run("UPDATE gastos SET description = ?, price = ? WHERE id = ?", [description, price, req.params.id], () => {
        res.redirect('/gastos');
    });
});

router.post('/delete/:id', authRequired, (req, res) => {
    req.db.run("DELETE FROM gastos WHERE id = ?", [req.params.id], () => {
        res.redirect('/gastos');
    });
});

module.exports = router;
