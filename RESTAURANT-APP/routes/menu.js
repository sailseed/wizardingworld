const express = require('express');
const router = express.Router();

// List All Items
router.get('/', (req, res) => {
    req.db.all("SELECT * FROM menu", [], (err, rows) => {
        res.render('menu/index', { items: rows });
    });
});

// Add Item
router.get('/agregar', (req, res) => {
    res.render('menu/add');
});

router.post('/agregar', (req, res) => {
    const { name, code, price, comment } = req.body;
    req.db.run("INSERT INTO menu (name, code, price, comment) VALUES (?, ?, ?, ?)",
               [name, code.toUpperCase().substring(0,2), price, comment], () => {
                   res.redirect('/menu');
               });
});

// Edit Item
router.get('/edit/:id', (req, res) => {
    req.db.get("SELECT * FROM menu WHERE id = ?", [req.params.id], (err, row) => {
        res.render('menu/edit', { item: row });
    });
});

router.post('/edit/:id', (req, res) => {
    const { name, code, price, comment } = req.body;
    req.db.run("UPDATE menu SET name=?, code=?, price=?, comment=? WHERE id=?",
               [name, code.toUpperCase().substring(0,2), price, comment, req.params.id], () => {
                   res.redirect('/menu');
               });
});

// Delete Item
router.post('/delete/:id', (req, res) => {
    req.db.run("DELETE FROM menu WHERE id = ?", [req.params.id], () => {
        res.redirect('/menu');
    });
});

module.exports = router;
