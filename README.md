# Electrosparkzz Billing

Make a bill and download it as a PDF. Live at https://billing.electrosparkzz.in

- Add items with quantity, unit and rate; amounts and totals update as you type.
- Discount (₹ or %), amount paid and balance due. Plain bill: no GST/invoice fields.
- Your business details, the bill you're editing and your downloaded bills are saved in the browser (localStorage) on that device only.
- PDFs are built in the browser with [jsPDF](https://github.com/parallax/jsPDF) + jspdf-autotable (vendored in `assets/vendor`), using Noto Sans so ₹ prints correctly.

Static site, no build step: open `index.html` or serve the folder.
