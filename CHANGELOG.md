# Changelog

All notable changes to this project are documented in this file.

## 0.1.1

### 中文

- 无厂商字段的 FIT，按距离回落、轨迹点速度、session 平均速度与爬升下降等特征识别为咕咚。
- 来源为咕咚时，把轨迹点距离统一为从起点起的累计距离。判定为分段差值时才累加；速度与相邻点差值相符，或末点接近 session 总距离时，保持文件里的累计值。
- 咕咚无设备信息的 FIT / TCX 按 GCJ-02 处理，与本地 GPX 一致。带设备信息的导出仍为 WGS-84。
- 活动总距离优先采用文件给出的值。文件距离与轨迹折线相差超过 20% 时，不再改用折线估算。

### English

- Classify manufacturer-less FIT files as Codoon from distance drops, point speed, and session average speed together with ascent and descent.
- When the source is Codoon, normalize track-point distance to a cumulative distance from the start. Accumulate only when the values are segment deltas. Keep the file values when speed matches the gap between neighboring points, or the last point is close to the session total.
- Treat Codoon FIT / TCX files without a recording device as GCJ-02, same as local GPX. Exports that include a device stay WGS-84.
- Prefer the distance written in the file for the activity total. A polyline estimate is no longer substituted when the file distance differs from it by more than 20%.

## 0.1.0

### 中文

- 首次公开发布：解析并写出 FIT / GPX / TCX，统一为 `Activity` 模型。

### English

- Initial public release: parse and write FIT / GPX / TCX with a unified `Activity` model.
