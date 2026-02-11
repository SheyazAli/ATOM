const puppeteer = require('puppeteer');

/**
 * Generate Revenue PDF using existing dashboard data
 */
async function exportRevenuePdf(res, renderData) {
  const browser = await puppeteer.launch({
    headless: 'new'
  });

  const page = await browser.newPage();

  // Render EJS to HTML
  const html = await new Promise((resolve, reject) => {
    res.render(
      'admin/revenue-pdf',
      renderData,
      (err, html) => (err ? reject(err) : resolve(html))
    );
  });

  await page.setContent(html, {
    waitUntil: 'networkidle0'
  });

  const pdf = await page.pdf({
    format: 'A4',
    landscape: true,
    printBackground: true
  });

  await browser.close();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename=revenue-report.pdf'
  );

  res.send(pdf);
}

module.exports = exportRevenuePdf;
