// Картинки для замены графики, нарисованной кодом.
// Положите PNG в папку assets/ и впишите его сюда — игра возьмёт картинку вместо своей.
// Если файла нет или строка закомментирована — останется графика, нарисованная кодом.
// Источник и лицензию каждой картинки укажите в assets/CREDITS.md.
//
// Ключи:
//   'building:<id>'  — постройка (id из js/data.js: furnace, workshop, chest, mine, nursery…);
//                      картинка любого размера, растягивается на всю постройку (2×2 → квадрат)
//   'unit:<id>'      — юнит: player, lumber, miner, goblin, goblin_archer, orc_brute, orc_thrower,
//                      orc_shaman, elf_blade, elf_mage, elf_lord, merchant, human, orc_slave, envoy
//   'camp:<kind>'    — постройка лагеря: hut, tent, totem, cage, portal
//   'ground:<имя>'   — почва 16×16: grass, sand, water, swamp, dark, rock (можно 'ground:grass:0'…'3' для вариантов)
//   'res:<имя>'      — ресурс на клетке 16×16: tree, stone, iron, copper, coal, sulfur, gold, mithril, bush, sand, ruins
//   'item:<id>'      — иконка предмета (wood, stone, iron_ore, plank…)
//
// Пример:
//   'building:furnace': 'buildings/furnace.png',
//   'res:tree': 'res/tree.png',
var ASSET_MANIFEST = {
};
