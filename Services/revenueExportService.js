const ExcelJS = require('exceljs');

async function exportRevenueExcel(res, tableData) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Revenue Report');

  sheet.columns = [
    { header: 'Order #', key: 'orderNumber', width: 15 },
    { header: 'Qty', key: 'quantity', width: 10 },
    { header: 'Cancelled', key: 'cancelledQty', width: 12 },
    { header: 'Returned', key: 'returnedQty', width: 12 },
    { header: 'Refund', key: 'refundAmount', width: 12 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Payment', key: 'paymentMethod', width: 12 },
    { header: 'Status', key: 'paymentStatus', width: 12 },
    { header: 'Subtotal', key: 'subtotal', width: 12 },
    { header: 'Discount', key: 'discount', width: 12 },
    { header: 'Total', key: 'total', width: 12 }
  ];

  tableData.forEach(row => sheet.addRow(row));

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename=revenue-report.xlsx'
  );

  await workbook.xlsx.write(res);
}

module.exports = exportRevenueExcel;