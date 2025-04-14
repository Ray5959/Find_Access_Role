/**
 * BR合约角色关系可视化工具
 * 将角色分析结果转换为可视化图表
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 加载.env配置
dotenv.config();

// 颜色配置
const BASE_COLORS = {
  'admin': '#FF5733',  // 管理员角色使用红色
  'default': '#33AA57' // 其他角色默认使用绿色
};

// 获取角色颜色映射
function getRoleColors(results) {
  const roleColors = {};
  
  // 默认管理员角色使用红色
  roleColors['DEFAULT_ADMIN_ROLE'] = BASE_COLORS.admin;
  
  // 从.env文件获取定义的角色
  const envRoles = Object.keys(process.env)
    .filter(key => 
      key.endsWith('_ROLE') && 
      !key.startsWith('DEFAULT_') && 
      process.env[key] !== undefined
    );
  
  // 建立角色层次结构
  const roleHierarchy = {};
  
  // 先设置管理员角色为最高级别
  roleHierarchy['DEFAULT_ADMIN_ROLE'] = 0;
  
  // 根据管理关系确定其他角色的层次
  Object.keys(results.adminRelationships || {}).forEach(roleName => {
    if (roleName !== 'DEFAULT_ADMIN_ROLE') {
      const adminRole = results.adminRelationships[roleName].adminRole;
      roleHierarchy[roleName] = (roleHierarchy[adminRole] || 0) + 1;
    }
  });
  
  // 为所有角色分配颜色
  Object.keys(results.roles || {}).forEach(roleName => {
    if (roleName === 'DEFAULT_ADMIN_ROLE') {
      return; // 已经分配过颜色
    }
    
    // 根据层级生成颜色
    const level = roleHierarchy[roleName] || 1;
    
    // 根据角色层级动态生成颜色
    // 管理员下一级角色用较深的绿色
    if (level === 1) {
      roleColors[roleName] = '#33AA57'; // 深绿色
    } 
    // 第三级角色用较浅的绿色
    else if (level === 2) {
      roleColors[roleName] = '#66CC88'; // 中绿色
    }
    // 更低层级用更浅的绿色
    else {
      roleColors[roleName] = '#99EEBB'; // 浅绿色
    }
  });
  
  // 设置默认颜色
  roleColors['default'] = '#AAAAAA';
  
  return roleColors;
}

function main() {
  // 读取分析结果
  const resultsPath = path.join(__dirname, 'role-analysis-results.json');
  if (!fs.existsSync(resultsPath)) {
    console.error('错误: 找不到角色分析结果文件，请先运行 role-analyzer.js');
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  
  // 生成动态角色颜色映射
  const ROLE_COLORS = getRoleColors(results);
  
  // 打印角色颜色配置
  printRoleColors(ROLE_COLORS, results);
  
  // 生成角色成员报告
  generateRoleMembersReport(results);
  
  // 生成角色管理关系报告
  generateRoleAdminReport(results, ROLE_COLORS);
  
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
function generateRoleAdminReport(results, ROLE_COLORS) {
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
  report += '\n';
  Object.keys(results.adminRelationships).forEach(roleName => {
    const color = ROLE_COLORS[roleName] || ROLE_COLORS.default;
    const textColor = isLightColor(color) ? 'black' : 'white';
    report += `  classDef ${roleName.replace(/-/g, '_')}Style fill:${color},color:${textColor},stroke:#333,stroke-width:2px\n`;
  });
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
 * 判断颜色是否为浅色（用于决定文字颜色）
 */
function isLightColor(hexColor) {
  // 去掉#前缀
  const hex = hexColor.replace('#', '');
  
  // 解析RGB值
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // 计算亮度 (基于人眼对RGB的感知权重)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  // 亮度大于128认为是浅色
  return brightness > 128;
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

/**
 * 打印角色颜色配置
 */
function printRoleColors(roleColors, results) {
  console.log('角色颜色配置:');
  console.log('============================');
  
  // 获取角色层次结构
  const hierarchy = {};
  Object.keys(results.adminRelationships || {}).forEach(roleName => {
    const adminRole = results.adminRelationships[roleName].adminRole;
    hierarchy[roleName] = adminRole;
  });
  
  // 按层次结构打印角色
  const printed = new Set();
  
  // 首先打印DEFAULT_ADMIN_ROLE
  if (roleColors['DEFAULT_ADMIN_ROLE']) {
    console.log(`DEFAULT_ADMIN_ROLE (管理员): ${roleColors['DEFAULT_ADMIN_ROLE']}`);
    printed.add('DEFAULT_ADMIN_ROLE');
  }
  
  // 然后按层次关系打印其他角色
  function printRolesWithAdmin(adminRole, indent) {
    Object.keys(hierarchy).forEach(roleName => {
      if (hierarchy[roleName] === adminRole && !printed.has(roleName)) {
        const color = roleColors[roleName] || roleColors.default;
        console.log(`${' '.repeat(indent)}${roleName}: ${color}`);
        printed.add(roleName);
        printRolesWithAdmin(roleName, indent + 2);
      }
    });
  }
  
  printRolesWithAdmin('DEFAULT_ADMIN_ROLE', 2);
  
  // 最后打印没有管理关系的角色
  Object.keys(roleColors).forEach(roleName => {
    if (!printed.has(roleName) && roleName !== 'default') {
      console.log(`${roleName}: ${roleColors[roleName]}`);
    }
  });
  
  console.log('============================');
}

// 执行主函数
main(); 