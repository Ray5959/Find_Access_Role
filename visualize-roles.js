/**
 * BR合约角色关系可视化工具
 * 将角色分析结果转换为可视化图表
 */

const fs = require('fs');
const path = require('path');

// 角色颜色映射
const ROLE_COLORS = {
  'DEFAULT_ADMIN_ROLE': '#FF5733',
  'MINTER_ROLE': '#33FF57', 
  'FREEZER_ROLE': '#3357FF',
  'default': '#AAAAAA'
};

function main() {
  // 读取分析结果
  const resultsPath = path.join(__dirname, 'role-analysis-results.json');
  if (!fs.existsSync(resultsPath)) {
    console.error('错误: 找不到角色分析结果文件，请先运行 role-analyzer.js');
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  
  // 生成角色成员报告
  generateRoleMembersReport(results);
  
  // 生成角色管理关系报告
  generateRoleAdminReport(results);
  
  // 生成地址角色报告
  generateAddressRolesReport(results);
  
  console.log('角色可视化报告已生成');
}

/**
 * 生成角色成员报告
 */
function generateRoleMembersReport(results) {
  const reportPath = path.join(__dirname, 'role-members-report.md');
  let report = '# BR合约角色成员报告\n\n';
  
  report += '## 角色成员概述\n\n';
  report += '| 角色 | 成员数量 | 成员地址 |\n';
  report += '| --- | --- | --- |\n';
  
  Object.keys(results.roles).forEach(roleName => {
    const role = results.roles[roleName];
    const memberList = role.members.length > 0 
      ? role.members.map(addr => `\`${addr}\``).join('<br>') 
      : '无';
    
    report += `| **${roleName}** | ${role.memberCount} | ${memberList} |\n`;
  });
  
  fs.writeFileSync(reportPath, report);
  console.log(`角色成员报告已保存到: ${reportPath}`);
}

/**
 * 生成角色管理关系报告
 */
function generateRoleAdminReport(results) {
  const reportPath = path.join(__dirname, 'role-admin-report.md');
  let report = '# BR合约角色管理关系报告\n\n';
  
  report += '## 角色管理关系\n\n';
  report += '```mermaid\ngraph TD\n';
  
  // 添加所有角色节点
  Object.keys(results.adminRelationships).forEach(roleName => {
    const color = ROLE_COLORS[roleName] || ROLE_COLORS.default;
    report += `  ${roleName.replace(/-/g, '_')}["${roleName}"]:::${roleName.replace(/-/g, '_')}Style\n`;
  });
  
  // 添加管理关系
  Object.keys(results.adminRelationships).forEach(roleName => {
    const adminInfo = results.adminRelationships[roleName];
    if (roleName !== adminInfo.adminRole) {
      report += `  ${adminInfo.adminRole.replace(/-/g, '_')} -->|管理| ${roleName.replace(/-/g, '_')}\n`;
    }
  });
  
  // 添加样式类
  report += '\n  classDef DEFAULT_ADMIN_ROLE_Style fill:#FF5733,color:white,stroke:#333,stroke-width:2px\n';
  report += '  classDef MINTER_ROLE_Style fill:#33FF57,color:black,stroke:#333,stroke-width:2px\n';
  report += '  classDef FREEZER_ROLE_Style fill:#3357FF,color:white,stroke:#333,stroke-width:2px\n';
  report += '```\n\n';
  
  // 添加表格
  report += '## 角色管理表\n\n';
  report += '| 角色 | 管理员角色 |\n';
  report += '| --- | --- |\n';
  
  Object.keys(results.adminRelationships).forEach(roleName => {
    const adminInfo = results.adminRelationships[roleName];
    report += `| **${roleName}** | ${adminInfo.adminRole} |\n`;
  });
  
  fs.writeFileSync(reportPath, report);
  console.log(`角色管理关系报告已保存到: ${reportPath}`);
}

/**
 * 生成地址角色报告
 */
function generateAddressRolesReport(results) {
  const reportPath = path.join(__dirname, 'address-roles-report.md');
  let report = '# BR合约地址角色报告\n\n';
  
  // 重建地址到角色的映射
  const addressRoles = {};
  
  Object.keys(results.roles).forEach(roleName => {
    const role = results.roles[roleName];
    role.members.forEach(address => {
      addressRoles[address] = addressRoles[address] || [];
      addressRoles[address].push(roleName);
    });
  });
  
  report += '## 多角色地址\n\n';
  report += '以下地址拥有多个角色：\n\n';
  report += '| 地址 | 角色 |\n';
  report += '| --- | --- |\n';
  
  const multiRoleAddresses = Object.keys(addressRoles).filter(addr => addressRoles[addr].length > 1);
  
  if (multiRoleAddresses.length > 0) {
    multiRoleAddresses.forEach(addr => {
      report += `| \`${addr}\` | ${addressRoles[addr].join(', ')} |\n`;
    });
  } else {
    report += '| *无* | *无* |\n';
  }
  
  report += '\n## 所有地址角色\n\n';
  report += '| 地址 | 角色 |\n';
  report += '| --- | --- |\n';
  
  Object.keys(addressRoles).forEach(addr => {
    report += `| \`${addr}\` | ${addressRoles[addr].join(', ')} |\n`;
  });
  
  fs.writeFileSync(reportPath, report);
  console.log(`地址角色报告已保存到: ${reportPath}`);
}

// 执行主函数
main(); 