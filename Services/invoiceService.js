const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

module.exports.generateInvoicePDF = ({
  order,
  stream,
  baseDir
}) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  doc.registerFont(
    'Roboto',
    path.join(baseDir, 'fonts', 'Roboto-Regular.ttf')
  );
  doc.registerFont(
    'Roboto-Bold',
    path.join(baseDir, 'fonts', 'Roboto-Bold.ttf')
  );

  doc.pipe(stream);


  const logoPath = path.join(
    baseDir,
    'uploads',
    'Atom logo white bg with name.png'
  );

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, 35, { width: 100 });
  }


  doc
    .font('Roboto-Bold')
    .fontSize(22)
    .text('INVOICE', 0, 45, { align: 'right' });

  doc
    .font('Roboto')
    .fontSize(10)
    .text(`Order ID: ${order.orderNumber}`, { align: 'right' })
    .text(`Date: ${new Date(order.created_at).toDateString()}`, { align: 'right' })
    .text(`Payment: ${order.paymentMethod.toUpperCase()}`, { align: 'right' });

  doc.moveDown(2);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(1);


  const LEFT_X = 40;
  let billToY = doc.y + 10;

  doc.font('Roboto-Bold').fontSize(11)
    .text('BILL TO', LEFT_X, billToY, { underline: true });

  billToY += 18;

  doc.font('Roboto')
    .text(order.address.building_name, LEFT_X, billToY)
    .text(order.address.address_line_1, LEFT_X)
    .text(
      `${order.address.city}, ${order.address.state} ${order.address.postal_code}`,
      LEFT_X
    )
    .text(order.address.country, LEFT_X)
    .text(`Phone: ${order.address.phone_number}`, LEFT_X);

  doc.moveDown(2);


  const tableTop = doc.y;

  doc.font('Roboto-Bold').fontSize(10);
  doc.text('Product', 40, tableTop);
  doc.text('Qty', 330, tableTop);
  doc.text('Price', 390, tableTop);
  doc.text('Total', 470, tableTop);

  doc.moveTo(40, tableTop + 12).lineTo(555, tableTop + 12).stroke();

  let y = tableTop + 20;
  doc.font('Roboto').fontSize(10);

  order.items.forEach(item => {
    doc.text(`${item.name}\n${item.variant}`, 40, y, { width: 270 });
    doc.text(item.quantity, 330, y);
    doc.text(`₹ ${item.price}`, 390, y);
    doc.text(`₹ ${item.total}`, 470, y);
    y += 38;
  });


  doc.moveDown(2);

  const boxX = 360;
  const boxY = doc.y;

  doc.rect(boxX - 10, boxY - 10, 205, 120).stroke();

  doc.fontSize(10)
    .text(`Subtotal: ₹${order.subtotal}`, boxX, boxY)
    .text(`Shipping: ₹${order.shipping || 0}`, boxX);

  if (order.discount > 0 && order.coupon?.coupon_code) {
    doc
      .fillColor('#0a7d34')
      .text(`Coupon: ${order.coupon.coupon_code}`, boxX)
      .text(`Discount: - ₹${order.discount}`, boxX)
      .fillColor('black');
  }

  doc.font('Roboto-Bold')
    .fontSize(12)
    .text(`Grand Total: ₹${order.total}`, boxX, doc.y + 5, {
      underline: true
    });

  doc
    .font('Roboto')
    .fontSize(9)
    .fillColor('gray')
    .text(
      'This is a system generated invoice. No signature required.',
      40,
      780,
      { align: 'center' }
    )
    .fillColor('black');

  doc.end();
};
