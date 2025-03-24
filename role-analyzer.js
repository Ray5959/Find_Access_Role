/**
 * BR合约角色分析工具
 * 用于清洗链上事件并分析角色分配情况
 */

require('dotenv').config();
const ethers = require('ethers');
const fs = require('fs');
const path = require('path');

// 控制台颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m'
};

// 美化日志输出
function log(message, type = 'info') {
  const timestamp = new Date().toISOString().slice(11, 19);
  switch(type) {
    case 'info':
      console.log(`${colors.bright}${colors.blue}[INFO]${colors.reset} ${colors.dim}[${timestamp}]${colors.reset} ${message}`);
      break;
    case 'success':
      console.log(`${colors.bright}${colors.green}[SUCCESS]${colors.reset} ${colors.dim}[${timestamp}]${colors.reset} ${message}`);
      break;
    case 'error':
      console.log(`${colors.bright}${colors.red}[ERROR]${colors.reset} ${colors.dim}[${timestamp}]${colors.reset} ${message}`);
      break;
    case 'warning':
      console.log(`${colors.bright}${colors.yellow}[WARNING]${colors.reset} ${colors.dim}[${timestamp}]${colors.reset} ${message}`);
      break;
    case 'event':
      console.log(`${colors.bright}${colors.magenta}[EVENT]${colors.reset} ${colors.dim}[${timestamp}]${colors.reset} ${message}`);
      break;
    case 'step':
      console.log(`\n${colors.bright}${colors.cyan}[STEP]${colors.reset} ${colors.dim}[${timestamp}]${colors.reset} ${colors.cyan}${message}${colors.reset}`);
      break;
    case 'header':
      console.log(`\n${colors.bright}${colors.white}${colors.bgRed}====== ${message} ======${colors.reset}\n`);
      break;
  }
}

// 检查必要的环境变量
if (!process.env.RPC_URL) {
  console.error('错误：未设置 RPC_URL 环境变量');
  process.exit(1);
}

// 读取CONTRACT_ADDRESS环境变量，支持多个地址（逗号分隔）
let contractAddresses = [];
if (process.env.CONTRACT_ADDRESS) {
  // 支持以逗号分隔的多个地址
  contractAddresses = process.env.CONTRACT_ADDRESS.split(',').map(addr => {
    const trimmed = addr.trim();
    // 确保地址格式正确
    try {
      return ethers.utils.getAddress(trimmed); // 标准化地址格式
    } catch (e) {
      // 如果是测试模式，允许有警告但继续执行
      if (process.env.TEST_MODE === 'true') {
        log(`警告: 地址 ${trimmed} 格式不规范，尝试标准化`, 'warning');
        // 确保地址至少是正确的十六进制格式
        if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
          return trimmed;
        } else {
          log(`错误: 即使在测试模式下，地址 ${trimmed} 也不是有效的以太坊地址格式`, 'error');
          process.exit(1);
        }
      } else {
        // 生产模式下直接终止程序
        log(`错误: 地址 ${trimmed} 不是有效的以太坊地址`, 'error');
        process.exit(1);
      }
    }
  });
  console.log(`已配置 ${contractAddresses.length} 个合约地址`);
} else {
  console.error('错误：未设置 CONTRACT_ADDRESS 环境变量');
  process.exit(1);
}

// 合约常量
const RPC_URL = process.env.RPC_URL;
// 获取当前分析的合约地址（如果指定了TARGET_ADDRESS则使用它，否则使用第一个地址）
const CURRENT_ADDRESS = process.env.TARGET_ADDRESS ? process.env.TARGET_ADDRESS.trim() : contractAddresses[0];

// 漂亮的进度条
function progressBar(current, total, barLength = 40) {
  const percentage = Math.floor((current / total) * 100);
  const filledLength = Math.floor((current / total) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  
  return `${bar} ${percentage}% (${current}/${total})`;
}

// 初始化角色哈希和名称
// 默认角色
const ROLE_HASHES = {
  DEFAULT_ADMIN_ROLE: '0x0000000000000000000000000000000000000000000000000000000000000000'
};

// 从环境变量中读取自定义角色
function loadCustomRolesFromEnv() {
  const customRoles = {};
  
  // 遍历环境变量，寻找定义的角色
  for (const key in process.env) {
    // 识别以_ROLE结尾的环境变量作为角色定义
    if (key.endsWith('_ROLE')) {
      const roleName = key;
      const roleValue = process.env[key];
      
      if (roleValue === 'true') {
        // 如果值为true，自动生成角色哈希
        customRoles[roleName] = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(roleName));
        log(`已添加自动生成哈希的角色: ${roleName}`, 'info');
      } else if (roleValue.startsWith('0x')) {
        // 如果值是以0x开头的哈希，直接使用
        customRoles[roleName] = roleValue;
        log(`已添加预定义哈希的角色: ${roleName} -> ${roleValue}`, 'info');
      } else {
        // 如果是其他值，将其视为角色字符串，生成相应的哈希
        customRoles[roleName] = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(roleValue));
        log(`已添加自定义角色: ${roleName} -> ${roleValue} (哈希: ${customRoles[roleName]})`, 'info');
      }
    }
  }
  
  return customRoles;
}

// 加载自定义角色
const customRoles = loadCustomRolesFromEnv();

// 合并默认角色和自定义角色
Object.assign(ROLE_HASHES, customRoles);

// 角色名称映射
const ROLE_NAMES = {};
// 添加默认角色
ROLE_NAMES[ROLE_HASHES.DEFAULT_ADMIN_ROLE] = 'DEFAULT_ADMIN_ROLE';

// 添加自定义角色到映射
for (const roleName in customRoles) {
  const roleHash = customRoles[roleName];
  ROLE_NAMES[roleHash] = roleName;
}

// 打印当前加载的所有角色
log('已加载的角色:', 'header');
for (const roleName in ROLE_NAMES) {
  const roleHash = Object.keys(ROLE_HASHES).find(key => ROLE_HASHES[key] === roleName);
  log(`${ROLE_NAMES[roleName]} -> ${roleName.substring(0, 10)}...`, 'info');
}

// 角色状态记录
let roleState = {};
const roleStateInitialized = false;
let roleGrantedEvents = [];
let roleRevokedEvents = [];

// ABI 片段，只包含我们关心的事件
const ABI_FRAGMENT = [
  "event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)"
];

// 分块获取事件，每次查询的区块范围
const BLOCK_RANGE = 1000; // 降低为1000个区块/批次

// 修改分块获取事件函数来同时处理多种事件类型
async function getEventsInChunks(contract, startBlock, endBlock) {
  log(`分块获取所有角色事件 (从区块 ${startBlock} 到 ${endBlock})...`, 'step');
  
  const allEvents = {
    granted: [],
    revoked: [],
    adminChanged: []
  };
  
  // 创建三种事件的过滤器
  const grantedFilter = contract.filters.RoleGranted();
  const revokedFilter = contract.filters.RoleRevoked();
  const adminChangedFilter = contract.filters.RoleAdminChanged();
  
  let currentStart = startBlock;
  let batchCount = 0;
  const totalBatches = Math.ceil((endBlock - startBlock + 1) / BLOCK_RANGE);
  
  log(`预计总批次数: ${totalBatches}`, 'info');
  
  // 允许用户设置起始批次
  let startBatch = 1;
  if (process.env.START_BATCH) {
    startBatch = parseInt(process.env.START_BATCH);
    if (startBatch > 1) {
      currentStart = startBlock + (startBatch - 1) * BLOCK_RANGE;
      log(`从批次 ${startBatch} 开始，起始区块: ${currentStart}`, 'info');
      batchCount = startBatch - 1;
    }
  }
  
  while (currentStart <= endBlock) {
    // 计算当前批次的结束区块
    const currentEnd = Math.min(currentStart + BLOCK_RANGE - 1, endBlock);
    batchCount++;
    
    log(`批次 ${batchCount}/${totalBatches}: ${progressBar(batchCount, totalBatches)}`, 'info');
    log(`获取区块 ${currentStart} 至 ${currentEnd} 的所有角色事件...`, 'info');
    
    // 添加重试逻辑
    let retryCount = 0;
    const maxRetries = 5; // 增加到5次
    let success = false;
    
    while (!success && retryCount < maxRetries) {
      try {
        // 并行获取三种事件以提高效率
        const [grantedEvents, revokedEvents, adminChangedEvents] = await Promise.all([
          contract.queryFilter(grantedFilter, currentStart, currentEnd),
          contract.queryFilter(revokedFilter, currentStart, currentEnd),
          contract.queryFilter(adminChangedFilter, currentStart, currentEnd)
        ]);
        
        allEvents.granted.push(...grantedEvents);
        allEvents.revoked.push(...revokedEvents);
        allEvents.adminChanged.push(...adminChangedEvents);
        
        // 总结本批次的结果
        let batchSummary = `批次 ${batchCount}: `;
        batchSummary += `找到 ${grantedEvents.length} 个RoleGranted事件, `;
        batchSummary += `${revokedEvents.length} 个RoleRevoked事件, `;
        batchSummary += `${adminChangedEvents.length} 个RoleAdminChanged事件`;
        log(batchSummary, 'success');
        
        // 如果找到事件，显示样本
        if (grantedEvents.length > 0) {
          log(`样本RoleGranted事件: ${JSON.stringify({
            blockNumber: grantedEvents[0].blockNumber,
            transactionHash: grantedEvents[0].transactionHash.substring(0, 10) + '...',
            args: Object.keys(grantedEvents[0].args).reduce((obj, key) => {
              obj[key] = typeof grantedEvents[0].args[key] === 'string' ? 
                grantedEvents[0].args[key].substring(0, 10) + '...' : 
                grantedEvents[0].args[key].toString();
              return obj;
            }, {})
          })}`, 'info');
        }
        
        if (revokedEvents.length > 0) {
          log(`样本RoleRevoked事件: ${JSON.stringify({
            blockNumber: revokedEvents[0].blockNumber,
            transactionHash: revokedEvents[0].transactionHash.substring(0, 10) + '...',
            args: Object.keys(revokedEvents[0].args).reduce((obj, key) => {
              obj[key] = typeof revokedEvents[0].args[key] === 'string' ? 
                revokedEvents[0].args[key].substring(0, 10) + '...' : 
                revokedEvents[0].args[key].toString();
              return obj;
            }, {})
          })}`, 'info');
        }
        
        if (adminChangedEvents.length > 0) {
          log(`样本RoleAdminChanged事件: ${JSON.stringify({
            blockNumber: adminChangedEvents[0].blockNumber,
            transactionHash: adminChangedEvents[0].transactionHash.substring(0, 10) + '...',
            args: Object.keys(adminChangedEvents[0].args).reduce((obj, key) => {
              obj[key] = typeof adminChangedEvents[0].args[key] === 'string' ? 
                adminChangedEvents[0].args[key].substring(0, 10) + '...' : 
                adminChangedEvents[0].args[key].toString();
              return obj;
            }, {})
          })}`, 'info');
        }
        
        success = true;
        
        // 保存进度
        try {
          const progress = {
            lastCompletedBatch: batchCount,
            totalBatches: totalBatches,
            currentBlock: currentEnd + 1,
            eventsFound: {
              granted: allEvents.granted.length,
              revoked: allEvents.revoked.length,
              adminChanged: allEvents.adminChanged.length
            }
          };
          saveProgress(progress, CURRENT_ADDRESS);
        } catch (saveError) {
          log(`无法保存进度: ${saveError.message}`, 'warning');
        }
      } catch (error) {
        retryCount++;
        log(`批次 ${batchCount} 尝试 ${retryCount}/${maxRetries} 失败: ${error.message}`, 'error');
        
        if (retryCount >= maxRetries) {
          log(`批次 ${batchCount} 重试次数已达上限，尝试减小范围...`, 'error');
          // 如果分块仍然太大，可以尝试进一步减小范围
          if (currentEnd - currentStart > 100) {
            log('批次过大，减小范围重试...', 'warning');
            const midBlock = Math.floor((currentStart + currentEnd) / 2);
            
            try {
              // 分成两半处理
              log(`尝试处理前半部分: ${currentStart} 至 ${midBlock}`, 'info');
              const [firstHalfGranted, firstHalfRevoked, firstHalfAdminChanged] = await Promise.all([
                contract.queryFilter(grantedFilter, currentStart, midBlock),
                contract.queryFilter(revokedFilter, currentStart, midBlock),
                contract.queryFilter(adminChangedFilter, currentStart, midBlock)
              ]);
              
              allEvents.granted.push(...firstHalfGranted);
              allEvents.revoked.push(...firstHalfRevoked);
              allEvents.adminChanged.push(...firstHalfAdminChanged);
              
              log(`批次 ${batchCount}a: 找到 ${firstHalfGranted.length} 个RoleGranted, ${firstHalfRevoked.length} 个RoleRevoked, ${firstHalfAdminChanged.length} 个RoleAdminChanged事件`, 'success');
              
              log(`尝试处理后半部分: ${midBlock + 1} 至 ${currentEnd}`, 'info');
              const [secondHalfGranted, secondHalfRevoked, secondHalfAdminChanged] = await Promise.all([
                contract.queryFilter(grantedFilter, midBlock + 1, currentEnd),
                contract.queryFilter(revokedFilter, midBlock + 1, currentEnd),
                contract.queryFilter(adminChangedFilter, midBlock + 1, currentEnd)
              ]);
              
              allEvents.granted.push(...secondHalfGranted);
              allEvents.revoked.push(...secondHalfRevoked);
              allEvents.adminChanged.push(...secondHalfAdminChanged);
              
              log(`批次 ${batchCount}b: 找到 ${secondHalfGranted.length} 个RoleGranted, ${secondHalfRevoked.length} 个RoleRevoked, ${secondHalfAdminChanged.length} 个RoleAdminChanged事件`, 'success');
              
              success = true;
            } catch (subError) {
              log(`减小范围后仍然失败: ${subError.message}`, 'error');
              log(`跳过区块 ${currentStart} 至 ${currentEnd} 的事件...`, 'warning');
            }
          } else {
            // 如果已经很小的范围也失败，记录错误继续
            log(`无法获取区块 ${currentStart} 至 ${currentEnd} 的事件，跳过此范围`, 'error');
          }
        } else {
          // 等待一段时间后重试
          const waitTime = 3000 * retryCount; // 递增等待时间
          log(`等待 ${waitTime/1000} 秒后重试...`, 'warning');
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // 移动到下一批次
    currentStart = currentEnd + 1;
  }
  
  // 总结所有事件
  log(`事件获取完成:`, 'success');
  log(`RoleGranted事件: ${allEvents.granted.length}个`, 'info');
  log(`RoleRevoked事件: ${allEvents.revoked.length}个`, 'info');
  log(`RoleAdminChanged事件: ${allEvents.adminChanged.length}个`, 'info');
  
  return allEvents;
}

// 获取RoleGranted事件后的处理
async function processRoleGrantedEvents(events) {
  log('总共找到 ' + events.length + ' 个RoleGranted事件', 'step');
  
  // 立即打印找到的角色和地址
  if (events.length > 0) {
    printRoleSummary(events, []);
  }
  
  // 继续处理事件
  events.forEach(event => {
    const role = event.args.role;
    const account = event.args.account;
    
    if (!roleState[role]) {
      roleState[role] = { members: new Set() };
    }
    
    roleState[role].members.add(account);
  });
}

// 新增 - 打印角色分配情况摘要
function printRoleSummary(grantEvents, revokeEvents) {
  log('当前角色分配情况摘要', 'header');
  console.log();
  
  const roleData = {};
  
  // 首先整理所有roleGranted事件数据
  grantEvents.forEach(event => {
    const roleHash = event.args.role;
    const account = event.args.account;
    const txHash = event.transactionHash;
    const blockNumber = event.blockNumber;
    const roleName = ROLE_NAMES[roleHash] || '未知角色';
    
    if (!roleData[roleName]) {
      roleData[roleName] = [];
    }
    
    roleData[roleName].push({
      account,
      txHash,
      blockNumber,
      type: '授予'
    });
  });
  
  // 然后整理所有roleRevoked事件数据
  revokeEvents.forEach(event => {
    const roleHash = event.args.role;
    const account = event.args.account;
    const txHash = event.transactionHash;
    const blockNumber = event.blockNumber;
    const roleName = ROLE_NAMES[roleHash] || '未知角色';
    
    if (!roleData[roleName]) {
      roleData[roleName] = [];
    }
    
    roleData[roleName].push({
      account,
      txHash,
      blockNumber,
      type: '撤销'
    });
  });
  
  // 打印摘要信息
  if (Object.keys(roleData).length === 0) {
    log('未找到角色分配记录', 'warning');
    return;
  }
  
  for (const [roleName, events] of Object.entries(roleData)) {
    log(`角色 [${roleName}] 的事件记录:`, 'info');
    console.log();
    
    // 按区块编号排序
    events.sort((a, b) => a.blockNumber - b.blockNumber);
    
    // 跟踪每个地址当前的状态
    const addressStatus = {};
    
    events.forEach(event => {
      const statusIcon = event.type === '授予' ? '✅' : '❌';
      log(`${statusIcon} 区块 ${event.blockNumber}: ${event.type} 给地址 ${event.account}`, 
          event.type === '授予' ? 'success' : 'warning');
      
      addressStatus[event.account] = event.type === '授予';
    });
    
    console.log();
    log(`当前有效的 ${roleName} 持有者:`, 'step');
    const activeHolders = Object.entries(addressStatus)
      .filter(([_, isActive]) => isActive)
      .map(([address, _]) => address);
    
    if (activeHolders.length === 0) {
      log(`  没有活跃的角色持有者`, 'warning');
    } else {
      activeHolders.forEach(address => {
        console.log(`  - ${address}`);
      });
    }
    console.log();
  }
  
  log('继续处理角色状态构建...', 'step');
  console.log();
}

// 在获取RoleRevoked事件后，添加处理和摘要输出
async function processRoleRevokedEvents(events, grantEvents) {
  log('总共找到 ' + events.length + ' 个RoleRevoked事件', 'step');
  
  events.forEach(event => {
    const role = event.args.role;
    const account = event.args.account;
    
    if (roleState[role] && roleState[role].members.has(account)) {
      roleState[role].members.delete(account);
    }
  });
  
  // 在处理完RoleRevoked事件后打印完整摘要
  if (grantEvents.length > 0 || events.length > 0) {
    printRoleSummary(grantEvents, events);
  }
  
  // 在处理完所有事件后再次打印当前状态
  log('所有事件处理完成，当前最终角色状态', 'header');
  for (const role in roleState) {
    const roleName = ROLE_NAMES[role] || '未知角色';
    log(`角色 ${roleName}:`, 'info');
    console.log(`  成员数量: ${roleState[role].members.size}`);
    if (roleState[role].members.size > 0) {
      log('  成员列表:', 'info');
      roleState[role].members.forEach(member => {
        console.log(`    - ${member}`);
      });
    } else {
      log('  没有成员', 'warning');
    }
    console.log();
  }
}

// 在脚本开始处添加一个标志变量来防止重复分析
let analysisCompleted = false;

// 在脚本初始化时立即输出日志
console.log("\x1b[35m===== BR角色分析脚本启动 ====\x1b[0m");
console.log("\x1b[36m当前工作目录:", process.cwd(), "\x1b[0m");
console.log("\x1b[36m环境变量状态:", {
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS || "未设置",
  RPC_URL: process.env.RPC_URL ? "已设置" : "未设置",
  START_BLOCK: process.env.START_BLOCK || "未设置",
  FORCE_REANALYSIS: process.env.FORCE_REANALYSIS === "true" ? "是" : "否"
}, "\x1b[0m");

// 保存检查点函数
function saveCheckpoint(data, contractAddress) {
  try {
    // 创建地址目录，确保每个合约有独立的数据文件夹
    const addressDir = path.join(__dirname, "addresses", contractAddress);
    if (!fs.existsSync(addressDir)) {
      fs.mkdirSync(addressDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(addressDir, "analysis-checkpoint.json"),
      JSON.stringify(data, null, 2)
    );
    log(`合约 ${contractAddress} 的检查点保存成功`, 'success');
  } catch (error) {
    log(`保存检查点失败: ${error.message}`, 'warning');
  }
}

// 保存分析进度函数
function saveProgress(progress, contractAddress) {
  try {
    // 创建地址目录，确保每个合约有独立的数据文件夹
    const addressDir = path.join(__dirname, "addresses", contractAddress);
    if (!fs.existsSync(addressDir)) {
      fs.mkdirSync(addressDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(addressDir, "analysis-progress.json"),
      JSON.stringify(progress, null, 2)
    );
    log(`合约 ${contractAddress} 的分析进度保存成功`, 'success');
  } catch (error) {
    log(`保存分析进度失败: ${error.message}`, 'warning');
  }
}

// 保存分析结果函数
function saveResults(results, contractAddress) {
  try {
    // 创建地址目录，确保每个合约有独立的数据文件夹
    const addressDir = path.join(__dirname, "addresses", contractAddress);
    if (!fs.existsSync(addressDir)) {
      fs.mkdirSync(addressDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(addressDir, "role-analysis-results.json"),
      JSON.stringify(results, null, 2)
    );
    log(`合约 ${contractAddress} 的分析结果保存成功`, 'success');
    
    // 标记完成
    fs.writeFileSync(
      path.join(addressDir, "role-analyzer-completed.json"),
      JSON.stringify({ 
        completed: true, 
        timestamp: new Date().toISOString(),
        contractAddress: contractAddress
      }, null, 2)
    );
    log(`合约 ${contractAddress} 的分析完成标记创建成功`, 'success');
  } catch (error) {
    log(`保存分析结果失败: ${error.message}`, 'warning');
  }
}

// 添加清理函数，用于测试时清除缓存文件
function cleanupForTesting() {
  const contractAddresses = process.env.CONTRACT_ADDRESS.split(',').map(addr => addr.trim());
  
  contractAddresses.forEach(contractAddress => {
    const contractDir = path.join(__dirname, 'addresses', contractAddress);
    if (fs.existsSync(contractDir)) {
      try {
        // 清除历史分析数据但保留文件夹结构
        const files = fs.readdirSync(contractDir);
        files.forEach(file => {
          fs.unlinkSync(path.join(contractDir, file));
        });
        log(`已清除合约 ${contractAddress} 的历史分析数据`, 'success');
      } catch (err) {
        log(`清除合约 ${contractAddress} 数据时出错: ${err.message}`, 'error');
      }
    }
  });

  // 清除总结报告
  const summaryPath = path.join(__dirname, 'all-contracts-summary.json');
  if (fs.existsSync(summaryPath)) {
    fs.unlinkSync(summaryPath);
    log('已清除总结报告', 'success');
  }
}

// 如果设置了CLEANUP_FOR_TEST环境变量，则执行清理
if (process.env.CLEANUP_FOR_TEST === 'true') {
  log('清理测试环境...', 'step');
  cleanupForTesting();
}

// 主函数
async function main() {
  try {
    log("开始执行角色分析脚本 👨‍💻", 'header');
    
    // 连接到区块链
    log("正在连接到区块链...", 'step');
    // 创建provider时禁用ENS
    const providerOptions = {
      ensDisabled: true, // 禁用ENS解析
      chainId: 56, // BSC主网链ID
    };
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL, providerOptions);
    
    try {
      // 测试连接
      const currentBlockNumber = await provider.getBlockNumber();
      log(`成功连接到区块链，当前区块高度: ${currentBlockNumber}`, 'success');
      
      // 当前分析的合约地址
      const contractAddress = process.env.TARGET_ADDRESS || CURRENT_ADDRESS;
      log(`当前分析的合约地址: ${contractAddress}`, 'step');
      
      // 创建地址目录
      const addressDir = path.join(__dirname, "addresses", contractAddress);
      if (!fs.existsSync(addressDir)) {
        fs.mkdirSync(addressDir, { recursive: true });
        log(`为合约 ${contractAddress} 创建数据目录`, 'info');
      }
      
      // 检查是否需要增量分析
      const progressFilePath = path.join(addressDir, "analysis-progress.json");
      if (fs.existsSync(progressFilePath)) {
        try {
          const progress = JSON.parse(fs.readFileSync(progressFilePath, 'utf8'));
          const lastAnalyzedBlock = progress.currentBlock;
          
          log(`上次分析到区块: ${lastAnalyzedBlock}，当前链上区块: ${currentBlockNumber}`, 'info');
          
          if (currentBlockNumber > lastAnalyzedBlock) {
            const blockDifference = currentBlockNumber - lastAnalyzedBlock;
            log(`发现新区块，需要增量分析 ${blockDifference} 个区块`, 'info');
            process.env.FORCE_REANALYSIS = "true"; // 强制重新分析
            process.env.START_BLOCK = String(lastAnalyzedBlock); // 从上次分析的区块开始
            log(`已设置增量分析参数，起始区块: ${process.env.START_BLOCK}`, 'info');
          }
        } catch (e) {
          log(`读取进度文件失败: ${e.message}，将进行完整分析`, 'warning');
        }
      }
    } catch (error) {
      log(`连接到RPC节点失败: ${error.message}`, 'error');
      throw new Error(`无法连接到RPC: ${error.message}`);
    }
    
    // 当前分析的合约地址
    const contractAddress = process.env.TARGET_ADDRESS || CURRENT_ADDRESS;
    const addressDir = path.join(__dirname, "addresses", contractAddress);
    
    // 首先检查是否已完成分析且不需要增量分析
    const completedFlagPath = path.join(addressDir, "role-analyzer-completed.json");
    if (fs.existsSync(completedFlagPath) && process.env.FORCE_REANALYSIS !== "true") {
      log(`合约 ${contractAddress} 的分析已经完成。若要重新分析，请设置环境变量 FORCE_REANALYSIS=true 或删除对应的completed文件`, 'warning');
      return;
    }
    
    // 检查结果文件是否已存在且不在强制重新分析模式
    const resultPath = path.join(addressDir, "role-analysis-results.json");
    if (fs.existsSync(resultPath) && process.env.FORCE_REANALYSIS !== "true") {
      log(`合约 ${contractAddress} 的分析结果文件已存在。若要重新分析，请设置环境变量 FORCE_REANALYSIS=true`, 'warning');
      log("已有分析结果，跳过重复分析", 'info');
      
      // 创建完成标记文件
      fs.writeFileSync(
        completedFlagPath,
        JSON.stringify({ 
          completed: true, 
          timestamp: new Date().toISOString(),
          contractAddress: contractAddress
        }, null, 2)
      );
      log(`合约 ${contractAddress} 的分析完成标记创建成功`, 'success');
      
      return;
    }
    
    log(`当前工作目录: ${process.cwd()}`, 'info');
    log(`合约地址: ${contractAddress}`, 'info');
    log(`RPC URL: ${process.env.RPC_URL ? '已配置' : '未配置'}`, process.env.RPC_URL ? 'info' : 'warning');
    
    // 检查是否有恢复文件
    let checkpoint = null;
    const checkpointPath = path.join(addressDir, "analysis-checkpoint.json");
    if (fs.existsSync(checkpointPath) && process.env.FORCE_REANALYSIS !== "true") {
      try {
        checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
        log(`找到检查点文件，可以从上次中断点继续。上次完成到: ${JSON.stringify(checkpoint.status)}`, 'info');
        const shouldResume = true; // 这里可以改为用户交互确认
        if (shouldResume) {
          log('正在从检查点恢复...', 'step');
        } else {
          log('重新开始分析...', 'info');
          checkpoint = null;
        }
      } catch (e) {
        log(`检查点文件损坏: ${e.message}，将重新开始分析`, 'warning');
        checkpoint = null;
      }
    } else if (process.env.FORCE_REANALYSIS === "true") {
      log('强制重新分析模式：忽略现有检查点', 'warning');
      checkpoint = null;
    }
    
    // 加载合约
    log(`加载合约: ${contractAddress}`, 'step');
    // 创建合约实例时避免使用ENS
    let contract;
    try {
      // 确保地址格式正确，修复这个方法，如果失败则使用替代方法
      let standardizedAddress;
      try {
        standardizedAddress = ethers.utils.getAddress(contractAddress);
      } catch (e) {
        // 如果直接标准化失败，尝试使用规范格式重新创建地址
        log(`地址格式不规范，尝试修复: ${contractAddress}`, 'warning');
        // 检查是否是合法的十六进制格式
        if (/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
          // 去掉0x前缀，转为小写，然后重新添加0x前缀
          const addressWithoutPrefix = contractAddress.slice(2).toLowerCase();
          standardizedAddress = '0x' + addressWithoutPrefix;
          log(`使用修复后的地址: ${standardizedAddress}`, 'info');
        } else {
          log(`错误: 地址 ${contractAddress} 无法修复，不是有效的以太坊地址格式`, 'error');
          // 只有在测试模式下我们允许使用空结果，否则终止程序
          if (process.env.TEST_MODE === 'true') {
            saveEmptyResults(contractAddress);
            log(`测试模式: 由于合约地址无效，已创建空结果文件`, 'warning');
            return;
          } else {
            throw new Error(`地址格式无法修复: ${e.message}`);
          }
        }
      }
      
      contract = new ethers.Contract(
        standardizedAddress,
        ABI_FRAGMENT,
        provider
      );
      log(`合约地址已标准化为: ${standardizedAddress}`, 'info');
    } catch (error) {
      log(`加载合约失败: ${error.message}`, 'error');
      // 创建空的目录和结果文件，以便汇总报告能够包含此合约
      saveEmptyResults(contractAddress);
      log(`由于合约加载失败，已创建空结果文件`, 'warning');
      return; // 退出当前合约的分析，但不终止整个程序
    }

    // 变量追踪分析的阶段
    const analysisStatus = checkpoint?.status || {
      fetchedEvents: false,
      constructedRoleState: false,
      crossVerifiedRoles: false,
      generatedReport: false
    };
    
    let roleEvents;
    
    // 1. 获取所有角色相关事件
    if (!analysisStatus.fetchedEvents && !checkpoint?.roleEvents) {
      log('阶段 1: 获取所有角色事件...', 'step');
      
      // 获取合约的部署区块
      let startBlock = 0;
      if (process.env.START_BLOCK) {
        startBlock = parseInt(process.env.START_BLOCK);
        log(`使用指定的起始区块: ${startBlock}`, 'info');
      } else {
        try {
          // 尝试查找合约的创建区块
          log(`尝试查找合约的创建区块...`, 'info');
          const contractCreationTx = await provider.getCode(process.env.CONTRACT_ADDRESS);
          if (contractCreationTx) {
            log(`合约已部署，使用默认起始区块`, 'info');
            // 设置为指定的起始区块
            startBlock = 47388486; // 更新为正确的合约部署区块
            log(`使用合约部署区块: ${startBlock}`, 'info');
          }
        } catch (error) {
          log(`查找合约创建区块失败: ${error.message}，使用默认起始区块`, 'warning');
          startBlock = 47388486; // 更新为正确的合约部署区块
        }
      }
      
      // 获取当前区块号
      const currentBlock = await provider.getBlockNumber();
      log(`当前区块: ${currentBlock}`, 'info');
      
      // 计算总区块数
      let totalBlocks = currentBlock - startBlock;

      // 如果设置了TEST_MODE环境变量，限制扫描的区块数量
      if (process.env.TEST_MODE === 'true') {
        const testBlockRange = process.env.TEST_BLOCK_RANGE ? parseInt(process.env.TEST_BLOCK_RANGE) : 5000;
        log(`测试模式：限制扫描区块范围为 ${testBlockRange} 个区块`, 'warning');
        startBlock = Math.max(startBlock, currentBlock - testBlockRange);
        totalBlocks = currentBlock - startBlock;
        log(`已调整起始区块为 ${startBlock}`, 'info');
      }

      log(`需要扫描的区块总数: ${totalBlocks}`, 'info');
      
      // 获取所有相关事件
      log('获取所有角色事件...', 'step');
      roleEvents = await getEventsInChunks(
        contract,
        startBlock,
        currentBlock
      );
      
      log('所有事件获取完成', 'success');
      log(`RoleGranted事件: ${roleEvents.granted.length}个`, 'info');
      log(`RoleRevoked事件: ${roleEvents.revoked.length}个`, 'info');
      log(`RoleAdminChanged事件: ${roleEvents.adminChanged.length}个`, 'info');
      
      // 保存进度
      analysisStatus.fetchedEvents = true;
      saveCheckpoint({ roleEvents, status: analysisStatus }, contractAddress);
      
    } else if (checkpoint?.roleEvents) {
      log('使用检查点中的事件数据...', 'info');
      roleEvents = checkpoint.roleEvents;
      log(`从检查点加载 - RoleGranted事件: ${roleEvents.granted.length}个`, 'info');
      log(`从检查点加载 - RoleRevoked事件: ${roleEvents.revoked.length}个`, 'info');
      log(`从检查点加载 - RoleAdminChanged事件: ${roleEvents.adminChanged.length}个`, 'info');
    } else {
      log('无法获取角色事件数据', 'error');
      throw new Error('缺少角色事件数据且未设置获取事件');
    }
    
    // 2. 处理事件并构建角色状态
    let localRoleState = {};
    
    if (!analysisStatus.constructedRoleState) {
      log('阶段 2: 构建角色状态...', 'step');
      
      // 初始化角色状态对象
      localRoleState = {};
      Object.keys(ROLE_HASHES).forEach(roleName => {
        const roleHash = ROLE_HASHES[roleName];
        log(`初始化角色: ${roleName} (${roleHash.substring(0, 10)}...)`, "info");
        localRoleState[roleHash] = { members: new Set() };
      });
      
      // 处理事件
      log('处理RoleGranted事件...', 'step');
      roleEvents.granted.forEach(event => {
        const role = event.args.role;
        const account = event.args.account;
        
        if (!localRoleState[role]) {
          localRoleState[role] = { members: new Set() };
        }
        
        localRoleState[role].members.add(account);
      });
      
      log('处理RoleRevoked事件...', 'step');
      roleEvents.revoked.forEach(event => {
        const role = event.args.role;
        const account = event.args.account;
        
        if (localRoleState[role] && localRoleState[role].members.has(account)) {
          localRoleState[role].members.delete(account);
        }
      });
      
      log('处理RoleAdminChanged事件...', 'step');
      roleEvents.adminChanged.forEach(event => {
        const role = event.args.role;
        const newAdminRole = event.args.newAdminRole;
        
        if (!localRoleState[role]) {
          localRoleState[role] = { members: new Set() };
        }
        
        localRoleState[role].adminRole = newAdminRole;
      });
      
      // 保存进度
      analysisStatus.constructedRoleState = true;
      saveCheckpoint({ roleEvents, roleState: localRoleState, status: analysisStatus }, contractAddress);
      
      // 打印角色状态摘要
      log('角色状态摘要', 'header');
      printRoleSummary(roleEvents.granted, roleEvents.revoked);
      
    } else if (checkpoint?.roleState) {
      log('使用检查点中的角色状态...', 'info');
      localRoleState = checkpoint.roleState;
    } else {
      log('无法获取角色状态数据', 'error');
      throw new Error('缺少角色状态数据且未设置构建状态');
    }
    
    // 赋值给全局变量以便其他函数访问
    roleState = localRoleState;
    
    // 3. 获取当前的角色管理员关系
    log("获取当前角色管理员关系...", "step");
    const roleAdminRelationships = {};
    
    let callExceptionCount = 0;
    const maxCallExceptions = Object.keys(roleState).length;
    
    for (const role in roleState) {
      const roleName = ROLE_NAMES[role] || role.substring(0, 10) + "...";
      
      try {
        const adminRole = await contract.getRoleAdmin(role);
        const adminRoleName = ROLE_NAMES[adminRole] || adminRole.substring(0, 10) + "...";
        
        roleAdminRelationships[roleName] = { 
          adminRole: adminRoleName,
          roleId: role,
          adminRoleId: adminRole 
        };
        
        log(`角色 ${roleName} 的管理员是: ${adminRoleName}`, "info");
      } catch (error) {
        log(`无法获取角色 ${roleName} 的管理员: ${error.message}`, "error");
        callExceptionCount++;
      }
    }
    
    // 如果所有角色调用都失败，可能是地址不支持AccessControl
    if (callExceptionCount === maxCallExceptions && maxCallExceptions > 0) {
      log("⚠️ 重要提示: 所有角色调用均失败，这表明当前合约地址可能不支持AccessControl接口", "warning");
      log(`请检查地址 ${contractAddress} 是否正确，以及该合约是否实现了OpenZeppelin的AccessControl`, "warning");
      log("如果您确定地址正确，该合约可能使用了自定义的访问控制系统或没有实现标准接口", "warning");
    }
    
    // 4. 构建结果对象
    log("构建分析结果...", "step");
    const analysisResults = {
      roles: {},
      adminRelationships: roleAdminRelationships
    };
    
    // 填充角色数据
    for (const role in roleState) {
      const roleName = ROLE_NAMES[role] || role;
      // 确保 members 是数组而不是 Set
      const members = roleState[role].members instanceof Set 
        ? Array.from(roleState[role].members) 
        : Array.isArray(roleState[role].members) 
          ? roleState[role].members 
          : [];
      
      analysisResults.roles[roleName] = {
        id: role,
        members: members
      };
    }
    
    // 写入结果文件
    log("将分析结果写入文件...", "step");
    saveResults(analysisResults, contractAddress);
    
    log("角色分析完成", "header");
    
  } catch (error) {
    log(`分析过程中出错: ${error.message}`, "error");
    console.error('完整错误堆栈:');
    console.error(error);
    
    // 暂停一下以便查看错误信息
    console.log('将在5秒后退出...');
    setTimeout(() => process.exit(1), 5000);
  }
}

// 辅助函数：获取角色名称
function getRoleName(roleHash) {
  return ROLE_NAMES[roleHash] || `未知角色(${roleHash.slice(0, 10)}...)`;
}

// 添加一个函数用于分析所有配置的合约地址
async function analyzeAllContracts() {
  log("开始分析所有配置的合约地址", "header");
  
  // 如果用户指定了特定地址进行分析
  if (process.env.TARGET_ADDRESS) {
    log(`只分析指定的合约地址: ${process.env.TARGET_ADDRESS}`, "info");
    await main();
    return;
  }
  
  // 分析所有配置的合约地址
  log(`共有 ${contractAddresses.length} 个合约地址需要分析`, "info");
  
  for (let i = 0; i < contractAddresses.length; i++) {
    const address = contractAddresses[i];
    log(`开始分析第 ${i+1}/${contractAddresses.length} 个合约: ${address}`, "header");
    
    // 将当前地址设置为环境变量，让main函数使用
    process.env.TARGET_ADDRESS = address;
    
    // 分析当前合约
    await main();
    
    log(`合约 ${address} 分析完成`, "success");
  }
  
  log("所有合约分析完成", "header");
  
  // 生成汇总报告
  generateSummaryReport();
}

// 生成汇总报告，列出所有已分析的合约和它们的角色状态
function generateSummaryReport() {
  try {
    log("生成汇总报告...", "step");
    
    const addressesDir = path.join(__dirname, "addresses");
    if (!fs.existsSync(addressesDir)) {
      log("没有找到任何合约分析数据", "warning");
      return;
    }
    
    const contractDirs = fs.readdirSync(addressesDir).filter(dir => {
      return fs.statSync(path.join(addressesDir, dir)).isDirectory();
    });
    
    if (contractDirs.length === 0) {
      log("没有找到任何合约分析数据", "warning");
      return;
    }
    
    const summary = {
      analyzedAt: new Date().toISOString(),
      totalContracts: contractDirs.length,
      contracts: {}
    };
    
    // 收集每个合约的信息
    contractDirs.forEach(contractAddr => {
      const resultPath = path.join(addressesDir, contractAddr, "role-analysis-results.json");
      if (fs.existsSync(resultPath)) {
        try {
          const results = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
          
          // 为汇总报告提取关键信息
          summary.contracts[contractAddr] = {
            totalRoles: Object.keys(results.roles).length,
            roles: {},
            hasError: !!results.error
          };
          
          // 收集每个角色的信息
          Object.keys(results.roles).forEach(roleName => {
            summary.contracts[contractAddr].roles[roleName] = {
              id: results.roles[roleName].id,
              memberCount: results.roles[roleName].members.length,
              hasMembers: results.roles[roleName].members.length > 0
            };
          });
        } catch (e) {
          log(`无法读取合约 ${contractAddr} 的分析结果: ${e.message}`, "warning");
          // 添加错误状态的合约记录
          summary.contracts[contractAddr] = {
            totalRoles: 0,
            roles: {},
            hasError: true,
            errorMessage: e.message
          };
        }
      } else {
        // 分析结果文件不存在，记录错误状态
        summary.contracts[contractAddr] = {
          totalRoles: 0,
          roles: {},
          hasError: true,
          errorMessage: "分析结果文件不存在"
        };
      }
    });
    
    // 保存汇总报告
    fs.writeFileSync(
      path.join(__dirname, "all-contracts-summary.json"),
      JSON.stringify(summary, null, 2)
    );
    log("汇总报告已保存到 all-contracts-summary.json", "success");
  } catch (error) {
    log(`生成汇总报告失败: ${error.message}`, "error");
  }
}

// 保存空结果，用于处理无法加载合约的情况
function saveEmptyResults(contractAddress) {
  try {
    // 创建地址目录
    const addressDir = path.join(__dirname, "addresses", contractAddress);
    if (!fs.existsSync(addressDir)) {
      fs.mkdirSync(addressDir, { recursive: true });
    }
    
    // 创建空的角色分析结果
    const emptyResults = {
      roles: {
        "DEFAULT_ADMIN_ROLE": {
          id: "0x0000000000000000000000000000000000000000000000000000000000000000",
          members: []
        }
      },
      adminRelationships: {
        "DEFAULT_ADMIN_ROLE": {
          adminRole: "DEFAULT_ADMIN_ROLE",
          roleId: "0x0000000000000000000000000000000000000000000000000000000000000000",
          adminRoleId: "0x0000000000000000000000000000000000000000000000000000000000000000"
        }
      },
      error: "合约地址格式错误或无法连接"
    };
    
    fs.writeFileSync(
      path.join(addressDir, "role-analysis-results.json"),
      JSON.stringify(emptyResults, null, 2)
    );
    
    // 创建进度文件
    fs.writeFileSync(
      path.join(addressDir, "analysis-progress.json"),
      JSON.stringify({
        lastCompletedBatch: 0,
        totalBatches: 0,
        currentBlock: 0,
        eventsFound: {
          granted: 0,
          revoked: 0,
          adminChanged: 0
        },
        error: true
      }, null, 2)
    );
    
    // 创建完成标记
    fs.writeFileSync(
      path.join(addressDir, "role-analyzer-completed.json"),
      JSON.stringify({ 
        completed: true, 
        timestamp: new Date().toISOString(),
        contractAddress: contractAddress,
        error: true
      }, null, 2)
    );
  } catch (error) {
    log(`创建空结果文件失败: ${error.message}`, 'error');
  }
}

// 执行主函数
analyzeAllContracts()
  .then(() => {
    log('脚本执行成功', 'success');
    process.exit(0);
  })
  .catch(error => {
    log('脚本执行失败', 'error');
    log(`错误详情: ${error.message}`, 'error');
    console.error('完整错误堆栈:');
    console.error(error);
    
    // 暂停一下以便查看错误信息
    console.log('将在5秒后退出...');
    setTimeout(() => process.exit(1), 5000);
  }); 