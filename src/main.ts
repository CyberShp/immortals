import './style.css';
import { start } from './app/main';
void start().catch((error) => {
  document.querySelector('#app')!.textContent =
    `仙府启动失败：${error instanceof Error ? error.message : String(error)}。请保留浏览器存档，不要清空站点数据。`;
});
