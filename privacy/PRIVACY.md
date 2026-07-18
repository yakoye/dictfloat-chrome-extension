# DictFloat Privacy Policy

**Last updated: July 17, 2026**

DictFloat is a Chrome extension for floating dictionary lookup, sentence translation, and optional AI-assisted English analysis. This policy explains what data DictFloat processes and how that data is used.

## 1. Data DictFloat processes

Depending on the features enabled by the user, DictFloat may process:

- Words, phrases, sentences, or paragraphs that the user actively types, selects, or submits for lookup.
- User-created local glossary entries and imported JSON or CSV glossary data.
- Local MDX/MDD dictionary connection information and optional offline dictionary indexes.
- Lookup history, source order, interface preferences, and extension settings.
- Translation or AI provider configuration entered by the user, including API endpoint, model name, prompts, and API key.
- Limited tab information required to complete a user-triggered web-bridge translation.

DictFloat does not intentionally collect page content that the user has not selected or submitted for lookup.

## 2. Local storage

DictFloat stores settings, lookup history, editable glossaries, source configuration, and provider configuration in Chrome local extension storage on the user's device.

API keys are stored locally for the configured provider and are excluded from ordinary editable-data backup exports.

DictFloat does not operate a developer-controlled server for collecting this locally stored data.

## 3. Online lookup, translation, and AI providers

When the user enables an online dictionary, translation provider, web bridge, or AI provider and performs a lookup, DictFloat may send the actively submitted text to that selected third-party service.

Possible services include Chrome Built-in Translator, Microsoft Translator, Tencent Hunyuan, SiliconFlow, Zhipu GLM, Youdao, Baidu, Doubao, and user-configured OpenAI-compatible or other AI endpoints.

The relevant third party processes the submitted text under its own terms and privacy policy. DictFloat sends data only to providers enabled or configured by the user for the requested lookup, translation, or analysis.

## 4. API credentials

Users may enter API keys for optional translation or AI providers. These credentials are used only to authenticate requests to the provider selected by the user. DictFloat does not sell these credentials and does not send them to unrelated parties.

## 5. Chrome permissions

DictFloat uses Chrome permissions only for its stated dictionary, translation, and local-data functions:

- `storage` stores user-controlled settings and local extension data.
- `contextMenus` lets users explicitly look up selected text.
- `scripting` injects or repairs DictFloat's packaged content script after a user action.
- `unlimitedStorage` supports optional offline dictionaries and local indexes.
- `tabs` supports user-triggered web-bridge translation tabs.
- Host access lets DictFloat show its lookup interface on pages where the user invokes it.

DictFloat does not use these permissions to build or sell a browsing-history profile.

## 6. Data sharing and sale

DictFloat does not sell user data.

User-submitted text is shared only with an online dictionary, translation service, or AI provider that the user has enabled or configured for the requested feature. DictFloat does not share user data with advertisers or data brokers.

## 7. Analytics and advertising

DictFloat does not include advertising SDKs and does not use third-party analytics to track user activity.

## 8. Data deletion

Users can remove their data by:

- Clearing lookup history in DictFloat Settings.
- Deleting local glossary entries, dictionary connections, or provider configuration.
- Removing stored API keys.
- Clearing DictFloat extension storage in Chrome.
- Uninstalling the extension.

## 9. Security

DictFloat uses HTTPS when communicating with providers that expose HTTPS endpoints. Users should configure only providers and API endpoints they trust and should protect their API keys.

## 10. Children's privacy

DictFloat is not directed to children and does not knowingly collect personal information from children.

## 11. Policy changes

This policy may be updated when DictFloat's data practices or features change. The date at the top of this document will be updated accordingly.

## 12. Contact

[GitHub Issues](https://github.com/yakoye/dictfloat-chrome-extension/issues)

Repository: https://github.com/yakoye/dictfloat-chrome-extension

---

# DictFloat 隐私政策

**更新日期：2026 年 7 月 17 日**

DictFloat 是一个用于悬浮查词、句子翻译和可选 AI 英语解析的 Chrome 扩展。本政策说明 DictFloat 会处理哪些数据，以及这些数据的用途。

## 1. 处理的数据

根据用户启用的功能，DictFloat 可能处理：

- 用户主动输入、划选或提交查询的单词、短语、句子或段落；
- 用户创建或导入的本地术语库；
- 本地 MDX/MDD 词典连接信息和可选离线词典索引；
- 查询历史、来源顺序、界面偏好和扩展设置；
- 用户填写的翻译或 AI Provider 配置，包括 API 地址、模型、提示词和 API Key；
- 完成用户主动触发的网页桥接翻译所需的有限标签页信息。

DictFloat 不会主动收集用户未划选、未输入或未提交查询的网页内容。

## 2. 本地存储

设置、查询历史、可编辑术语库、词典来源配置和 Provider 配置保存在用户设备上的 Chrome 扩展本地存储中。

API Key 仅用于用户配置的 Provider，并从普通可编辑数据备份中排除。

DictFloat 不运营用于收集这些本地数据的开发者服务器。

## 3. 在线查询、翻译和 AI

当用户启用在线词典、翻译服务、网页桥接或 AI Provider 并执行查询时，DictFloat 可能把用户主动提交的文本发送给所选第三方服务。

第三方服务会按照其自己的条款和隐私政策处理收到的文本。DictFloat 只会把数据发送给用户已经启用或配置、并用于本次查询、翻译或解析的服务。

## 4. API 凭据

用户可以为可选翻译或 AI Provider 填写 API Key。该凭据只用于向用户选择的 Provider 验证请求，不会被出售，也不会发送给无关第三方。

## 5. Chrome 权限

DictFloat 仅将 Chrome 权限用于已说明的查词、翻译和本地数据功能，不会利用这些权限建立或出售浏览历史画像。

## 6. 数据共享和出售

DictFloat 不出售用户数据，不向广告商或数据经纪商共享用户数据。

只有用户主动提交的文本，才可能发送给用户启用的在线词典、翻译服务或 AI Provider。

## 7. 分析和广告

DictFloat 不包含广告 SDK，也不使用第三方分析服务追踪用户活动。

## 8. 数据删除

用户可以在 Settings 中清除历史、删除本地术语库和 Provider 配置、移除 API Key、清除 Chrome 扩展存储或卸载扩展。

## 9. 联系方式

[GitHub Issues](https://github.com/yakoye/dictfloat-chrome-extension/issues)

项目仓库：https://github.com/yakoye/dictfloat-chrome-extension
