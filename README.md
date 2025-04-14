# 智能角色分析工具

这个工具是为区块链合约进行全面角色分析而设计的专业工具，通过分析链上事件来重建完整的角色分配情况，支持OpenZeppelin的AccessControl合约标准。

## 核心功能

- **事件扫描与分析**：获取并分析所有RoleGranted、RoleRevoked和RoleAdminChanged事件
- **角色状态重建**：按区块高度顺序处理事件，精确重建合约的角色分配状态
- **增量分析**：自动检测区块链新增区块，仅分析新区块中的事件，避免重复工作
- **多合约支持**：同时分析多个合约地址，提高审计效率
- **自定义角色支持**：支持动态配置自定义角色及其哈希值
- **智能错误处理**：自动识别无效地址和不兼容的合约
- **断点续传**：保存分析进度，支持中断后从上次位置继续
- **交叉验证**：验证计算结果与链上状态的一致性
- **综合报告**：生成详细的角色分配摘要和可视化报告
- **地址查询**：快速检查特定地址拥有的角色权限

## 安装

1. 确保已安装Node.js (推荐v16+)

2. 安装依赖:
```bash
cd script/roles
npm install
```

## 配置指南

### 基本配置

在`.env`文件中设置以下核心参数：

```bash
# 合约地址配置（支持多个地址，用逗号分隔）
CONTRACT_ADDRESS=0xFf7d6A96ae471BbCD7713aF9CB1fEeB16cf56B41,0xD8A792E6C447980525A95E5d3538bEbc922d50f4

# RPC节点URL
RPC_URL=https://your-rpc-endpoint.com/

# 区块链网络ID
CHAIN_ID=1    # 以太坊主网=1，BSC=56，Polygon=137，Arbitrum=42161等

# 分析控制
START_BLOCK=47388486    # 开始分析的区块号
FORCE_REANALYSIS=false  # 是否强制重新分析
```

### 自定义角色配置

系统支持三种角色定义方式：

1. **使用角色名自动生成哈希**：
   ```
   MINTER_ROLE=true
   ```

2. **自定义字符串生成哈希**：
   ```
   FREEZER_ROLE=FREEZER_ROLE
   ```

3. **直接指定角色哈希**：
   ```
   PAUSER_ROLE=0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a
   ```

> 所有角色环境变量必须以`_ROLE`结尾，系统会自动识别。DEFAULT_ADMIN_ROLE (0x0) 已默认包含。

### 高级配置选项

```bash
# 测试模式 - 限制扫描区块范围，加快测试速度
TEST_MODE=true
TEST_BLOCK_RANGE=5000

# 批处理控制 - 如需从特定批次开始
START_BATCH=1
```

## 使用指南

### 一键式运行

执行完整分析和可视化：
```bash
npm run all
# 或
node analyze-all.js
```

### 角色分析

只执行角色分析：
```bash
npm run analyze
# 或
node role-analyzer.js
```

#### 分析过程:

1. 连接区块链并验证合约地址
2. 读取之前的分析进度（如果存在）
3. 确定需要分析的区块范围
4. 批量获取链上角色事件
5. 处理事件并重建角色状态
6. 验证计算结果与链上状态一致性
7. 保存分析结果和进度

### 单一地址角色查询

检查某个地址拥有的角色：
```bash
npm run check 0xBE9895146f7AF43049ca1c1AE358B0541Ea49704
# 或
node check-address.js 0xBE9895146f7AF43049ca1c1AE358B0541Ea49704
```

在特定合约中查询：
```bash
npm run check 0xBE9895146f7AF43049ca1c1AE358B0541Ea49704 0xD8A792E6C447980525A95E5d3538bEbc922d50f4
# 或
node check-address.js 0xBE9895146f7AF43049ca1c1AE358B0541Ea49704 0xD8A792E6C447980525A95E5d3538bEbc922d50f4
```

### 可视化报告生成

生成可视化报告：
```bash
npm run visualize
# 或
node visualize-roles.js
```

## 增量分析功能

系统会智能跟踪区块链状态，实现增量分析：

1. 启动时读取`analysis-progress.json`获取上次分析区块高度
2. 连接区块链获取当前最新区块高度
3. 只分析新增区块中的事件
4. 更新分析进度记录

这大幅提高了重复分析的效率，特别适合定期监控角色变化。

## 错误处理机制

系统能够优雅处理各种错误情况：

1. **无效地址格式**：
   ```
   [ERROR] 错误: 地址 0xinvalid 不是有效的以太坊地址
   ```

2. **非AccessControl合约**：
   ```
   [WARNING] ⚠️ 重要提示: 所有角色调用均失败，这表明当前合约地址可能不支持AccessControl接口
   [WARNING] 请检查地址 0x... 是否正确，以及该合约是否实现了OpenZeppelin的AccessControl
   [WARNING] 如果您确定地址正确，该合约可能使用了自定义的访问控制系统或没有实现标准接口
   ```

3. **网络错误**：自动重试机制，支持批次减半处理

## 输出文件说明

### 目录结构

```
/script/roles/
├── addresses/
│   ├── 0xContractAddress1/
│   │   ├── analysis-checkpoint.json  # 分析检查点
│   │   ├── analysis-progress.json    # 分析进度
│   │   ├── role-analysis-results.json # 角色分析结果
│   │   └── role-analyzer-completed.json # 完成标记
│   └── 0xContractAddress2/
│       └── ...
├── all-contracts-summary.json        # 所有合约汇总报告
└── reports/                         # 可视化报告目录
    ├── role-members-report.md       # 角色成员报告
    ├── role-admin-report.md         # 角色管理关系报告
    └── address-roles-report.md      # 地址角色报告
```

### 数据格式

`role-analysis-results.json` 包含：
```json
{
  "roles": {
    "DEFAULT_ADMIN_ROLE": {
      "id": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "members": ["0xAddress1", "0xAddress2"]
    },
    "MINTER_ROLE": {
      "id": "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6",
      "members": ["0xAddress3"]
    }
  },
  "adminRelationships": {
    "DEFAULT_ADMIN_ROLE": {
      "adminRole": "DEFAULT_ADMIN_ROLE",
      "roleId": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "adminRoleId": "0x0000000000000000000000000000000000000000000000000000000000000000"
    },
    "MINTER_ROLE": {
      "adminRole": "DEFAULT_ADMIN_ROLE",
      "roleId": "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6",
      "adminRoleId": "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
  }
}
```

`all-contracts-summary.json` 包含：
```json
{
  "analyzedAt": "2025-03-24T08:49:43.607Z",
  "totalContracts": 2,
  "contracts": {
    "0xContractAddress1": {
      "totalRoles": 4,
      "roles": {
        "DEFAULT_ADMIN_ROLE": {
          "id": "0x00000000...",
          "memberCount": 1,
          "hasMembers": true
        },
        "MINTER_ROLE": {
          "id": "0x9f2df0fe...",
          "memberCount": 2,
          "hasMembers": true
        }
      },
      "hasError": false
    },
    "0xContractAddress2": {
      "totalRoles": 4,
      "roles": {
        "DEFAULT_ADMIN_ROLE": {
          "id": "0x00000000...",
          "memberCount": 0,
          "hasMembers": false
        }
      },
      "hasError": false
    }
  }
}
```

## 可视化报告

1. **角色成员报告**：按角色列出所有成员地址
2. **角色管理关系报告**：包含Mermaid图表展示角色间管理关系
3. **地址角色报告**：按地址列出所有拥有的角色

## 性能优化

- **分块查询**：使用1000区块/批次的批处理机制避免RPC限制
- **并行处理**：同时获取多种事件类型提高效率
- **增量分析**：跳过已分析区块大幅提升性能
- **智能重试**：网络错误时自动重试，支持分块减半处理更大范围

## 注意事项

- 确保RPC节点有足够的请求配额和稳定连接
- 分析大范围区块可能需要较长时间，考虑使用TEST_MODE和增量分析
- 该工具仅分析链上事件，不会修改合约状态
- 查看Mermaid图表需使用支持Mermaid语法的Markdown查看器
- 对于超大规模分析，建议使用可靠的商业RPC服务 