const escpos = require('escpos');
const usb = require('usb');

if (usb.usb && !usb.on) {
    usb.on = (event, callback) => usb.usb.on(event, callback);
}

escpos.USB = require('escpos-usb');

const VID = 0x0fe6;
const PID = 0x811e;

const clean = (text) => {
    if (!text) return "";
    return text.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .toUpperCase();
};

const imprimirTicket = (servicio, items) => {
    try {
        const device = new escpos.USB(VID, PID);
        const printer = new escpos.Printer(device);

        device.open(function(error) {
            if (error) return console.error("Error impresora:", error);

            const now = new Date();
            const horaLocal = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

            printer
            .hardware('init') // <--- ESTO RESETEA EL TAMAÑO A NORMAL (ESC @)
        .font('a')       // Aseguramos fuente estándar
        .align('ct')
        .style('b')
        .text(clean('*** PEDIDO DE COCINA ***'))
        .text('--------------------------------')
        .text(clean(servicio.mesa_name))
        .text(servicio.service_code)
        .style('normal')
        .text('--------------------------------')
        .align('lt');

        if (servicio.domicilio) {
            printer.style('b').text('DIR: ' + clean(servicio.domicilio)).style('normal');
            printer.text('--------------------------------');
        }

        // Encabezado
        printer.style('b').text('CAN PRODUCTO            TOTAL').style('normal');

        let totalCuenta = 0;
        items.forEach(item => {
            const subtotal = item.quantity * item.price;
            totalCuenta += subtotal;

            const cant = item.quantity.toString().padEnd(4, ' ');
            const nombre = clean(item.name).substring(0, 18).padEnd(19, ' ');
            const precio = "$" + subtotal.toFixed(2);

            printer.text(`${cant}${nombre}${precio.padStart(9, ' ')}`);

            if (item.comment) {
                printer.text(' >> ' + clean(item.comment).substring(0, 28));
            }
        });

        printer
        .text('--------------------------------')
        .align('rt')
        .style('b')
        .text('TOTAL: $' + totalCuenta.toFixed(2))
        .style('normal')
        .align('ct')
        .text('--------------------------------');

        if (servicio.pagado === 1) {
            printer
            .feed(1)
            .style('b')
            .text('*** ORDEN PAGADA ***')
            .text('COBRAR: $0.00')
            .style('normal')
            .feed(1);
        } else {
            printer.text('METODO: ' + clean(servicio.payment_method || 'PENDIENTE'));
        }

        printer
        .text('HORA: ' + horaLocal)
        .cut()
        .close();
        });
    } catch (err) {
        console.error("Error crítico impresión:", err);
    }
};

// ... (mismo encabezado de escpos y usb) ...

const imprimirReciboCliente = (servicio, items) => {
    try {
        const device = new escpos.USB(VID, PID);
        const printer = new escpos.Printer(device);

        device.open(function(error) {
            if (error) return console.error("Error impresora:", error);

            const now = new Date();
            const fecha = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

            printer
            .hardware('init')
            .font('a')
            .align('ct')
            .style('b')
            .text(clean('LA HAMBURGUESA Y LA ORDEN DE LAS PAPAS')) // Pon el nombre de tu negocio aquí
            .style('normal')
            .text('--------------------------------')
            .text(clean('CUENTA DE CONSUMO'))
            .style('b')
            .text(clean(servicio.mesa_name))
            .text(servicio.service_code)
            .style('normal')
            .text('--------------------------------')
            .align('lt');

            printer.style('b').text('CAN PRODUCTO            TOTAL').style('normal');

            let totalCuenta = 0;
            items.forEach(item => {
                const subtotal = item.quantity * item.price;
                totalCuenta += subtotal;
                const cant = item.quantity.toString().padEnd(4, ' ');
                const nombre = clean(item.name).substring(0, 18).padEnd(19, ' ');
                const precio = "$" + subtotal.toFixed(2);
                printer.text(`${cant}${nombre}${precio.padStart(9, ' ')}`);
            });

            printer
            .text('--------------------------------')
            .align('rt')
            .size(1, 1)
            .style('b')
            .text('TOTAL A PAGAR: $' + totalCuenta.toFixed(2))
            .style('normal')
            .align('ct')
            .text('--------------------------------')
            .text(fecha)
            .cut()
            .close();
        });
    } catch (err) {
        console.error("Error crítico impresión:", err);
    }
};

// Exportamos ambas funciones
module.exports = { imprimirTicket, imprimirReciboCliente };
