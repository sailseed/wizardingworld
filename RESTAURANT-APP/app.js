const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');


const app = express();
const db = new sqlite3.Database('./restaurant.db');


// Middleware
app.use(session({
    secret: 'secret-key-restaurant',
    resave: false,
    saveUninitialized: true
}));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Initialize Database Tables
db.serialize(() => {
    // 1. Tabla de Menú
    db.run(`CREATE TABLE IF NOT EXISTS menu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, code TEXT, price REAL, comment TEXT
    )`);

    // 2. Tabla de Gastos
    db.run(`CREATE TABLE IF NOT EXISTS gastos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        g_code TEXT, timestamp TEXT, description TEXT,
        price REAL, session_id TEXT DEFAULT 'NA', receipt_img TEXT
    )`);

    // 3. Tabla de Mesas (Las estructuras físicas)
    db.run(`CREATE TABLE IF NOT EXISTS mesas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, type TEXT
    )`, () => {
        // Insertar mesas por defecto si la tabla está vacía
        db.get("SELECT COUNT(*) as count FROM mesas", (err, row) => {
            if (row && row.count === 0) {
                db.run("INSERT INTO mesas (name, type) VALUES ('Recolección', 'recoleccion')");
                db.run("INSERT INTO mesas (name, type) VALUES ('Envío', 'envio')");
            }
        });
    });

    // 4. Tabla de Servicios (Las cuentas/órdenes abiertas)
    db.run(`CREATE TABLE IF NOT EXISTS servicios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_code TEXT,
        mesa_id INTEGER,
        status TEXT DEFAULT 'active',
        total REAL DEFAULT 0,
        payment_method TEXT,
        timestamp TEXT,
        domicilio TEXT,
        pagado INTEGER DEFAULT 0
    )`);

    // 5. Tabla de Pedidos (Los productos dentro de cada cuenta)
    db.run(`CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER,
        menu_item_id INTEGER,
        name TEXT,
        price REAL,
        quantity INTEGER,
        comment TEXT,
        enviado INTEGER DEFAULT 0,
        preparado INTEGER DEFAULT 0
    )`);

    // Tabla de Sesiones
    db.run(`CREATE TABLE IF NOT EXISTS sesiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_code TEXT,
        start_timestamp TEXT,
        end_timestamp TEXT,
        status TEXT DEFAULT 'open' -- 'open' o 'closed'
    )`);

    // Tabla de Fondos
    db.run(`CREATE TABLE IF NOT EXISTS fondos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        f_code TEXT,
        amount REAL,
        timestamp TEXT
    )`);

    console.log("Base de datos e infraestructura de tablas lista.");
});

// Pass DB to requests
app.use((req, res, next) => {
    req.db = db;
    next();
});

// ROUTE: Dashboard (Main Hub)
app.get('/', (req, res) => {
    res.render('dashboard');
});

// ROUTE: Menu Module
const menuRoutes = require('./routes/menu');
app.use('/menu', menuRoutes);

// Add the route (place this near menuRoutes)
const gastosRoutes = require('./routes/gastos');
app.use('/gastos', gastosRoutes);

const mesasRoutes = require('./routes/mesas');
app.use('/mesas', mesasRoutes);

const cocinaRoutes = require('./routes/cocina');
app.use('/cocina', cocinaRoutes);

const cierreRoutes = require('./routes/cierre');
app.use('/cierre', cierreRoutes);

app.listen(3000, () => {
    console.log("Restaurant App running at http://localhost:3000");
});
