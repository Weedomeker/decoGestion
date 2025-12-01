const fs = require("fs");
const XLSX = require("xlsx");
const path = require("path");
const createXlsx = async (data) => {
  if (fs.existsSync(path.join(__dirname, "../public/session.xlsx"))) {
    const wb = XLSX.readFile(path.join(__dirname, "../public/session.xlsx"), { cellStyles: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    XLSX.utils.sheet_add_json(ws, data, {
      origin: -1,
      skipHeader: true,
    });
    XLSX.writeFile(wb, path.join(__dirname, "../public/session.xlsx"), { cellStyles: true });
  } else {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "session");
    XLSX.writeFile(wb, path.join(__dirname, "../public/session.xlsx"));
  }
};

module.exports = createXlsx;
