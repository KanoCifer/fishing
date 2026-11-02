# 鱼种识别：视觉模型+白名单

> 用户拍鱼照，22 个鱼种里认出哪种。只认清单内鱼种，认不出就说认不出。

## 0 命名

fishing 的 fish=鱼种、Server-Go 的 fish=钓点；新代码用 species 命名

## 1 链路

**识别用图不落盘**：进 gallery/ 或 CDN 即公开

## 2 后端

### 2.2 白名单

源 gen-fish-images.py SPECIES；产出 catalog.json，fingerprint=(id,name,scientific) 排序 sha256，启动校验不符即报错。每条加 confusable 易混提示（鲫鲤鳊、鲢鳙、草青）

### 2.6 三道闸

1. prompt+JSON：只选清单内、严格 JSON、认不出就说认不出；剥代码块>括号配平截对象，失败 502
2. schema：id 不在白名单丢弃；confidence 钳 [0,1] 非法丢弃；candidates≤3；verdict 非法降 uncertain
3. 回填：只信 id/confidence/features，name/鱼种图/署名查清单

### 2.7 置信度

- top1≥0.6 且差≥0.15 → identified
- top1≥0.6 但差<0.15 → uncertain
- top1<0.6 或无候选/清单外 → uncertain/not_in_list

### 2.9 隐私审核

⚠️ 照片发第三方 AI 服务须在隐私指引声明并列接收方，否则驳回（docs/mp-weixin-network.md「隐私协议」）

## 4 验收

| 指标 | 目标 |
| --- | --- |
| 延迟 | P50<3s/P95<6s |
| 成本 | <¥0.02（零售¥0.05） |
| 失败率 | <2% |
| 准确率 | top1≥80%（30~50 张） |

uncertain 10%~25% 健康

## 7 待拍板

1. 定价 5 厘/次（¥0.05）待账单
2. 是否强制登录：扣积分须登录，匿名会被刷
3. 鱼种数据何时迁后端：要展示分布/钓法/食用风险
