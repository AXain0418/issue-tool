// ⚠️ 部署設定 — 建立好 Google 試算表 / Drive 資料夾 / GAS Web App 後，
// 把下面兩個值換成實際的網址與金鑰即可，不需要改動 script.js。
//
// 在你填入真正的 GAS_API_URL 之前，網站會自動以「展示模式」運作
// （使用假資料、按送出也只是模擬，不會真的呼叫後端），方便你在
// 完成 GAS 部署前繼續預覽/操作畫面。
window.APP_CONFIG = {
  // GAS 專案 → 部署 → 網頁應用程式，取得的網址（結尾是 /exec）
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbxYVzzd6Rc1ux_c5PbugM8CmI_gtRINvApbWrsKQ9jzngSycEHqnxFfFJamgAu0PyTScw/exec',

  // 自訂一組驗證字串，需與 GAS 後端 Code.gs 內 CONFIG.APP_KEY 完全一致
  APP_KEY: 'S2sqVWOK-A5qUM9ru_g5pr5ygjiWMzab',
};
