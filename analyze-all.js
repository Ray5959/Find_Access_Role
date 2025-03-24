/**
 * BR合约角色分析一键启动脚本
 * 顺序执行角色分析和可视化脚本
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('===== BR合约角色分析工具 =====');
console.log('1. 开始执行角色分析...');

try {
  // 执行角色分析脚本
  execSync('node role-analyzer.js', { 
    stdio: 'inherit',
    cwd: __dirname 
  });
  
  console.log('\n2. 角色分析完成，开始生成可视化报告...');
  
  // 执行可视化脚本
  execSync('node visualize-roles.js', { 
    stdio: 'inherit',
    cwd: __dirname 
  });
  
  console.log('\n===== 角色分析全部完成 =====');
  console.log('分析结果保存在以下文件:');
  console.log('- role-analysis-results.json: 原始分析数据');
  console.log('- role-members-report.md: 角色成员报告');
  console.log('- role-admin-report.md: 角色管理关系报告');
  console.log('- address-roles-report.md: 地址角色报告');
  
} catch (error) {
  console.error('\n执行过程中发生错误:');
  console.error(error.message);
  process.exit(1);
} 