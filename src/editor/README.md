# 地图编辑器

这个目录保留了上游的简易地图/精灵编辑器，用于编辑 AI Town 的地图图层和碰撞层。主应用运行不依赖它，但如果要改地图，它仍然有参考价值。

## 启动

```bash
npm run le
```

启动后访问 Vite 输出的地址，通常是 `http://localhost:5173` 或端口被占用后的下一个可用端口。

## 基本流程

1. 启动编辑器。
2. 在 config 标签页里导入地图 composite 文件，也就是 `.js` 地图文件。
3. 配置 tileset，有两种方式：
   - 在 config 标签页输入 tileset 路径。
   - 修改 `leconfig.js` 里的 `DEFAULTTILESETPATH`，例如把 `./tilesets/gentle.png` 改成你的 tileset。

## 地图编辑

基础操作：

- 在右上角 tileset 面板选择 tile，类似选择画笔。
- 点击左上角面板，把 tile 放到背景层。背景层不产生碰撞。
- 点击第二行左侧面板，把 tile 放到物体层。物体层会产生碰撞。

快捷键：

- `f`：用当前 tile 填充第 0 层。
- `Ctrl+z`：撤销。
- `g`：显示或隐藏 32x32 网格。
- `s`：生成 `.js` 地图文件。
- `m`：在 tile 上显示半透明红色遮罩，方便寻找不可见 tile。
- `d`：按住并点击 tile，删除该 tile。
- `p`：在 16 像素和 32 像素模式之间切换。

## 地图文件结构

保存地图后，会得到类似下面的 JavaScript export：

```js
export const tilesetpath = './tilesets/gentle-obj.png';
export const tiledim = 32;
export const screenxtiles = 45;
export const screenytiles = 32;
export const tilesetpxw = 1440;
export const tilesetpxh = 1024;

export const bgtiles = [
  // 背景层二维数组，不产生碰撞
];

export const objmap = [
  // 物体层二维数组，会产生碰撞
];
```

字段说明：

- `tilesetpath`：地图使用的 tileset 图片路径。
- `tiledim`：单个 tile 的像素尺寸，例如 `32`。
- `screenxtiles` / `screenytiles`：地图宽高，以 tile 数量表示。
- `tilesetpxw` / `tilesetpxh`：tileset 图片本身的像素宽高，不是地图宽高。
- `bgtiles`：背景层二维数组。
- `objmap`：物体层二维数组。每个数字对应 tileset 中的一个 tile 坐标。

## 应用新地图

生成新地图后，需要把项目初始化逻辑指向新的地图文件，并清理/重建开发数据。

本地自托管 Convex 时，可以参考根目录 README 的 `.env.selfhost.local` 配置，然后执行：

```bash
npx convex run --env-file .env.selfhost.local testing:wipeAllTablesForDev
npx convex run --env-file .env.selfhost.local init
```

这些命令会清理当前开发数据并重新初始化 world。只建议在开发环境使用。
