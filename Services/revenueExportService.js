const ExcelJS = require('exceljs');

/**
 * Generates and streams Revenue Excel report
 * @param {Object} res - Express response
 * @param {Array} tableData - Full revenue table data
 */
async function exportRevenueExcel(res, tableData) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Revenue Report');

  sheet.columns = [
    { header: 'Order Number', key: 'orderNumber', width: 15 },
    { header: 'Total Qty', key: 'quantity', width: 12 },
    { header: 'Cancelled Qty', key: 'cancelledQty', width: 15 },
    { header: 'Returned Qty', key: 'returnedQty', width: 15 },
    { header: 'Refund Amount', key: 'refundAmount', width: 15 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Payment Method', key: 'paymentMethod', width: 15 },
    { header: 'Payment Status', key: 'paymentStatus', width: 15 },
    { header: 'Subtotal', key: 'subtotal', width: 12 },
    { header: 'Discount', key: 'discount', width: 12 },
    { header: 'Net Total', key: 'total', width: 15 }
  ];

  tableData.forEach(row => {
    sheet.addRow({
      orderNumber: row.orderNumber,
      quantity: row.quantity,
      cancelledQty: row.cancelledQty,
      returnedQty: row.returnedQty,
      refundAmount: row.refundAmount,
      date: row.date,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total
    });
  });

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

module.exports = {
  exportRevenueExcel
};
