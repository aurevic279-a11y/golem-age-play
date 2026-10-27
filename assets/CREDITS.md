# Источники картинок

## Спрайты из 3D-моделей (`assets/sprites/`)

Вся графика мира — герой, враги, големы, торговец, деревья, камни, руда, рудные горы, постройки, стены и лагеря — отрендерена из бесплатных 3D-моделей фотостудией `tools/bake/` (одна камера и один свет для всех, 64 пикселя = 1 клетка). Модели скачивает `bash tools/bake/fetch_models.sh`.

| Что | Откуда | Автор | Лицензия |
|---|---|---|---|
| Деревья, камни, кусты, цветы, грибы | Nature Kit — https://kenney.nl/assets/nature-kit | Kenney | CC0 |
| Дома, мастерские, мельницы, колодцы | Fantasy Town Kit — https://kenney.nl/assets/fantasy-town-kit | Kenney | CC0 |
| Стены, башни, требушет | Castle Kit — https://kenney.nl/assets/castle-kit | Kenney | CC0 |
| Персонажи (герой, гоблины, орки, эльфы, торговец, големы) | Ultimate Animated Character Pack, RPG Characters — https://quaternius.com | Quaternius | CC0 |

CC0 — общественное достояние: можно использовать как угодно, указание автора не обязательно, но мы его указываем.

## Нарисовано кодом

Земля, тракты, акведуки, валы, рвы, иконки предметов, огонь, дым и эффекты рисуются кодом (`js/sprites.js`, `js/gfx.js`, `js/art*.js`).

## Как добавить свои картинки

1. Берите свободные модели и спрайты (CC0, CC-BY) — например Kenney (https://kenney.nl/assets), Quaternius (https://quaternius.com) или OpenGameArt (https://opengameart.org).
2. 3D-модели перерисовываются в спрайты фотостудией `tools/bake/` (нужен браузер с WebGL); готовые PNG и разметка кладутся в `assets/sprites/`.
3. Отдельные картинки можно подключить через `assets/manifest.js`.
4. Добавляйте сюда строку: что, откуда, автор, лицензия.
