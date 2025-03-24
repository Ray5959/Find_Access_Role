/**
 * 地址角色查询工具
 * 用于快速获取一个地址所拥有的所有角色
 */

require('dotenv').config();
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
    case 'header':
      console.log(`\n${colors.bright}${colors.white}${colors.bgRed}====== ${message} ======${colors.reset}\n`);
      break;
    case 'result':
      console.log(`${colors.bright}${colors.cyan}[RESULT]${colors.reset} ${colors.dim}[${timestamp}]${colors.reset} ${message}`);
      break;
  }
}

// 检查参数
if (process.argv.length < 3) {
  log('使用方法: node check-address.js <地址> [合约地址]', 'error');
  process.exit(1);
}

const targetAddress = process.argv[2];
// 如果提供了合约地址参数，使用它，否则使用环境变量或默认值
const contractAddress = process.argv[3] || '';

log(`检查地址: ${targetAddress}`, 'header');

if (contractAddress) {
  log(`指定的合约地址: ${contractAddress}`, 'info');
  
  // 查询特定合约
  checkAddressInContract(targetAddress, contractAddress);
} else {
  log('未指定合约地址，将在所有已分析的合约中查询', 'info');

  // 查询所有已分析的合约
  checkAddressInAllContracts(targetAddress);
}

// 在特定合约中检查地址
function checkAddressInContract(address, contract) {
  const addressDir = path.join(__dirname, 'addresses', contract);
  const resultPath = path.join(addressDir, 'role-analysis-results.json');
  
  if (!fs.existsSync(resultPath)) {
    log(`未找到合约 ${contract} 的分析结果。先运行role-analyzer.js进行分析`, 'error');
    return;
  }
  
  try {
    const results = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    log(`已加载合约 ${contract} 的角色数据`, 'success');
    
    // 查找该地址拥有的所有角色
    let hasAnyRole = false;
    
    for (const roleName in results.roles) {
      const role = results.roles[roleName];
      
      if (role.members.includes(address)) {
        log(`在合约 ${contract} 中，地址 ${address} 拥有角色: ${roleName}`, 'result');
        hasAnyRole = true;
      }
    }
    
    if (!hasAnyRole) {
      log(`在合约 ${contract} 中，地址 ${address} 没有任何角色`, 'warning');
    }
  } catch (error) {
    log(`读取合约 ${contract} 的角色数据时出错: ${error.message}`, 'error');
  }
}

// 在所有已分析的合约中检查地址
function checkAddressInAllContracts(address) {
  const addressesDir = path.join(__dirname, 'addresses');
  
  if (!fs.existsSync(addressesDir)) {
    log('未找到任何合约分析数据。先运行role-analyzer.js进行分析', 'error');
    return;
  }
  
  // 获取所有已分析的合约目录
  const contractDirs = fs.readdirSync(addressesDir).filter(dir => {
    return fs.statSync(path.join(addressesDir, dir)).isDirectory();
  });
  
  if (contractDirs.length === 0) {
    log('未找到任何已分析的合约数据', 'warning');
    return;
  }
  
  log(`共发现 ${contractDirs.length} 个已分析的合约，开始查询...`, 'info');
  
  let foundInAnyContract = false;
  
  contractDirs.forEach(contractAddr => {
    const resultPath = path.join(addressesDir, contractAddr, 'role-analysis-results.json');
    
    if (fs.existsSync(resultPath)) {
      try {
        const results = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        let hasRoleInThisContract = false;
        
        for (const roleName in results.roles) {
          const role = results.roles[roleName];
          
          if (role.members.includes(address)) {
            log(`在合约 ${contractAddr} 中，地址 ${address} 拥有角色: ${roleName}`, 'result');
            hasRoleInThisContract = true;
            foundInAnyContract = true;
          }
        }
        
        if (hasRoleInThisContract) {
          log(`合约 ${contractAddr} 查询完成，发现角色`, 'info');
        }
      } catch (e) {
        log(`读取合约 ${contractAddr} 的角色数据时出错: ${e.message}`, 'error');
      }
    }
  });
  
  if (!foundInAnyContract) {
    log(`地址 ${address} 在所有已分析的合约中都没有任何角色`, 'warning');
  } else {
    log(`地址 ${address} 的角色查询完成`, 'success');
  }
} 