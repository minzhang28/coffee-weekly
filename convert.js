#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const cheerio = require('cheerio');

// Find all markdown files in posts directory
function findMarkdownFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Parse markdown content into structured data
function parseMarkdown(content) {
  const lines = content.split('\n');
  const data = {
    title: '',
    theme: '',
    pourOverPicks: [],
    espressoPicks: [],
    howToChoose: ''  // Add field for the final narrative section
  };

  let currentPick = null;
  let currentSection = null;
  let inHowToChoose = false;
  let currentBrewMethod = 'pourover'; // Track which section we're in

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Extract title
    if (line.startsWith('# ')) {
      data.title = line.replace('# ', '');
      continue;
    }

    // Extract theme (first paragraph after title)
    if (!data.theme && line && !line.startsWith('#') && !line.startsWith('##') && !line.startsWith('###')) {
      data.theme = line;
      continue;
    }

    // Check for brew method sections
    if (line.match(/^## (?:手冲豆推荐|Pour Over Recommendations?)/)) {
      if (currentPick) {
        // Push using OLD brew method before changing it
        if (currentBrewMethod === 'pourover') {
          data.pourOverPicks.push(currentPick);
        } else {
          data.espressoPicks.push(currentPick);
        }
        currentPick = null;
      }
      currentBrewMethod = 'pourover';
      continue;
    }

    if (line.match(/^## (?:意式豆推荐|Espresso Recommendations?)/)) {
      if (currentPick) {
        // Push using OLD brew method before changing it
        if (currentBrewMethod === 'pourover') {
          data.pourOverPicks.push(currentPick);
        } else {
          data.espressoPicks.push(currentPick);
        }
        currentPick = null;
      }
      currentBrewMethod = 'espresso';
      continue;
    }

    // Check for "How to Choose" section at the end
    if (line.match(/^## (?:怎么选|How to Choose)/)) {
      inHowToChoose = true;
      if (currentPick) {
        if (currentBrewMethod === 'pourover') {
          data.pourOverPicks.push(currentPick);
        } else {
          data.espressoPicks.push(currentPick);
        }
        currentPick = null;
      }
      continue;
    }

    // Collect "How to Choose" content
    if (inHowToChoose && line && !line.startsWith('#')) {
      data.howToChoose += line + ' ';
      continue;
    }

    // Extract pick heading with URL
    const pickMatch = line.match(/^### (?:Pick|推荐) (\d+): \[(.+?)\]\((.+?)\)/);
    if (pickMatch) {
      if (currentPick) {
        if (currentBrewMethod === 'pourover') {
          data.pourOverPicks.push(currentPick);
        } else {
          data.espressoPicks.push(currentPick);
        }
      }
      inHowToChoose = false;
      currentPick = {
        name: pickMatch[2],
        url: pickMatch[3],
        roaster: '',
        origin: '',
        variety: '',
        process: '',
        roast: '',
        price: '',
        roastDate: '',
        whyGet: [],
        varietyCharacter: '',
        flavorDescription: '',
        brewRatio: '',
        brewTemp: '',
        brewGrind: ''
      };
      currentSection = null;
      continue;
    }

    if (!currentPick) continue;

    // Parse sections (only match headers starting with ####)
    if (line.startsWith('####')) {
      if (line.includes('基本信息') || line.includes('Coffee Profile')) {
        currentSection = 'profile';
        continue;
      }
      if (line.includes('入手理由') || line.includes('Why Get This')) {
        currentSection = 'why';
        continue;
      }
      if (line.includes('风味档案') || line.includes('Flavor Profile')) {
        currentSection = 'flavor';
        continue;
      }
      if (line.includes('冲煮参考') || line.includes('Brew Guide')) {
        currentSection = 'brew';
        continue;
      }
    }

    // Parse profile fields
    if (currentSection === 'profile' && line.startsWith('- ')) {
      const fieldMatch = line.match(/- (?:烘焙商|Roaster)[：:]\s*(.+)/);
      if (fieldMatch) currentPick.roaster = fieldMatch[1];

      const originMatch = line.match(/- (?:产地|Origin)[：:]\s*(.+)/);
      if (originMatch) currentPick.origin = originMatch[1];

      const varietyMatch = line.match(/- (?:品种|Variety)[：:]\s*(.+)/);
      if (varietyMatch) currentPick.variety = varietyMatch[1];

      const processMatch = line.match(/- (?:处理法|Process)[：:]\s*(.+)/);
      if (processMatch) currentPick.process = processMatch[1];

      const roastMatch = line.match(/- (?:烘焙度|Roast)[：:]\s*(.+)/);
      if (roastMatch) currentPick.roast = roastMatch[1];

      const roastDateMatch = line.match(/- (?:烘焙日期|Roast Date)[：:]\s*(.+)/);
      if (roastDateMatch) currentPick.roastDate = roastDateMatch[1];

      const priceMatch = line.match(/- (?:价格|Price)[：:]\s*(.+)/);
      if (priceMatch) currentPick.price = priceMatch[1];
    }

    // Parse why section (collect all lines under ① and ②)
    if (currentSection === 'why' && line.startsWith('- ')) {
      currentPick.whyGet.push(line.replace(/^- /, ''));
    }

    // Parse flavor section - extract from bold markers
    if (currentSection === 'flavor') {
      const varietyMatch = line.match(/\*\*(?:品种特性|Variety Character)\*\*[：:]\s*(.+)/);
      if (varietyMatch) currentPick.varietyCharacter = varietyMatch[1];

      const flavorMatch = line.match(/\*\*(?:风味描述|Flavor Description|Tastes Like)\*\*[：:]\s*(.+)/);
      if (flavorMatch) currentPick.flavorDescription = flavorMatch[1];
    }

    // Parse brew guide - extract specific fields
    if (currentSection === 'brew' && line.startsWith('- ')) {
      const ratioMatch = line.match(/- (?:粉水比|萃取比例|Ratio)[：:]\s*(.+)/);
      if (ratioMatch) currentPick.brewRatio = ratioMatch[1];

      const doseMatch = line.match(/- (?:粉量|Dose)[：:]\s*(.+)/);
      if (doseMatch && !currentPick.brewRatio) currentPick.brewRatio = doseMatch[1];

      const tempMatch = line.match(/- (?:水温|Temp|Temperature)[：:]\s*(.+)/);
      if (tempMatch) currentPick.brewTemp = tempMatch[1];

      const grindMatch = line.match(/- (?:研磨|Grind)[：:]\s*(.+)/);
      if (grindMatch) currentPick.brewGrind = grindMatch[1];
    }
  }

  if (currentPick) {
    if (currentBrewMethod === 'pourover') {
      data.pourOverPicks.push(currentPick);
    } else {
      data.espressoPicks.push(currentPick);
    }
  }

  // Clean up howToChoose
  data.howToChoose = data.howToChoose.trim();

  return data;
}

// Generate HTML from template
function generateHTML(data, language, date) {
  const template = fs.readFileSync('template.html', 'utf8');
  const $ = cheerio.load(template);

  // Remove header nav
  $('header').remove();

  // Remove footer
  $('footer').remove();

  // Update title
  $('title').text(data.title || 'Weekly Coffee Report');
  $('h1').html(`${language === 'chinese' ? '本周' : "This Week's"} <span class="text-accent italic">${language === 'chinese' ? '咖啡推荐' : 'Coffee Picks'}</span>`);

  // Update "Weekly Coffee Report" badge to date
  $('.glass-tag').text(date || new Date().toISOString().split('T')[0]);

  // Update theme
  $('h1').next('p').text(data.theme || '');

  // Clear existing cards in Pour Over section (section index 1)
  $('section').eq(1).find('.grid.grid-cols-1.xl\\:grid-cols-2.gap-12').empty();

  // Clear existing cards in Espresso section (section index 2)
  $('section').eq(2).find('.grid.grid-cols-1.xl\\:grid-cols-2.gap-12').empty();

  // Update section titles
  $('section').eq(1).find('h2').text(language === 'chinese' ? '手冲豆推荐' : 'Pour Over Recommendations');
  $('section').eq(2).find('h2').text(language === 'chinese' ? '意式豆推荐' : 'Espresso Recommendations');

  // Generate cards for pour over picks
  data.pourOverPicks.forEach(pick => {
    const card = `
      <div class="soft-ui-raised p-8 flex flex-col lg:flex-row gap-8 transition-all duration-500 hover:shadow-2xl">
        <div class="lg:w-1/3 flex flex-col gap-4">
          <div class="relative overflow-hidden rounded-3xl aspect-[4/5] soft-ui-inset">
            <img alt="${pick.name}" class="w-full h-full object-cover mix-blend-multiply opacity-90" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC-X_WNV5ruDhDL7LxI0nsmnDFaGUGVUWxAIRZR3Ld8RZskmqrFXk-ZHSLOnhXXfP1_fpjnN0YBM_vfZm3wOZbUajj34uUnXdlXcz-sHn40-qxTDvHLL7u6dbO464OyBKyTZZw3FChlKJvgZfjDQbzHqpNCgpSxg_3gZfAfm9hcdQU6iEAoAOt9JY0Es4oFcLN-VUAq7KIFwt-YWyx3n8GuM9diIfPKU6z1MLpWiLcOjS5dsruR6aNnLg15ase2nnvYjBurRmeLVAgB"/>
          </div>
          <div class="inner-card-section p-5 rounded-2xl">
            <h4 class="text-[10px] font-black uppercase tracking-widest text-accent mb-4">${language === 'chinese' ? '咖啡信息' : 'COFFEE PROFILE'}</h4>
            <div class="space-y-3">
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '烘焙商' : 'Roaster'}</p>
                <p class="text-xs font-bold text-primary">${pick.roaster}</p>
              </div>
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '产地' : 'Origin'}</p>
                <p class="text-xs font-bold text-primary">${pick.origin}</p>
              </div>
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '品种' : 'Variety'}</p>
                <p class="text-xs font-bold text-primary">${pick.variety}</p>
              </div>
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '处理法' : 'Process'}</p>
                <p class="text-xs font-bold text-primary">${pick.process}</p>
              </div>
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '烘焙度' : 'Roast'}</p>
                <p class="text-xs font-bold text-primary">${pick.roast}</p>
              </div>
            </div>
          </div>
        </div>
        <div class="lg:w-2/3 flex flex-col">
          <div class="flex justify-between items-start mb-6">
            <div>
              <h3 class="text-2xl font-extrabold text-primary leading-tight"><a href="${pick.url}" target="_blank" class="hover:text-accent transition-colors">${pick.name}</a></h3>
              <p class="text-sm font-medium text-slate-400 italic">${language === 'chinese' ? '手冲咖啡' : 'Pour Over Method'}</p>
            </div>
            <span class="text-2xl font-black text-primary">${pick.price}</span>
          </div>
          <div class="inner-card-section p-6 rounded-3xl mb-4">
            <p class="text-[10px] font-black uppercase tracking-widest text-accent mb-3">${language === 'chinese' ? '入手理由' : 'WHY GET THIS'}</p>
            <ul class="list-disc list-inside space-y-2">
              ${pick.whyGet.map(reason => `<li class="text-sm text-slate-600 leading-relaxed">${reason}</li>`).join('\n              ')}
            </ul>
          </div>
          <div class="inner-card-section p-6 rounded-3xl mb-6">
            <p class="text-[10px] font-black uppercase tracking-widest text-accent mb-3">${language === 'chinese' ? '风味档案' : 'FLAVOR PROFILE'}</p>
            ${pick.varietyCharacter ? `<p class="text-sm text-slate-600 leading-relaxed mb-2">${pick.varietyCharacter}</p>` : ''}
            <p class="text-sm font-medium text-slate-700">${pick.flavorDescription}</p>
          </div>
          <div class="mt-auto">
            <div class="flex items-center gap-2 mb-4">
              <span class="material-symbols-outlined text-accent text-lg">science</span>
              <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">${language === 'chinese' ? '冲煮参考' : 'Brew Guide'}: <span class="text-slate-400 font-medium">${pick.brewRatio} | ${pick.brewTemp} | ${pick.brewGrind}</span></p>
            </div>
            <a href="${pick.url}" target="_blank" class="soft-ui-button w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] text-accent hover:text-white hover:bg-accent transition-all block text-center">
              ${language === 'chinese' ? '查看详情' : 'View Full Profile'}
            </a>
          </div>
        </div>
      </div>
    `;

    $('section').eq(1).find('.grid.grid-cols-1.xl\\:grid-cols-2.gap-12').append(card);
  });

  // Generate cards for espresso picks
  data.espressoPicks.forEach(pick => {
    const card = `
      <div class="soft-ui-raised p-8 flex flex-col lg:flex-row gap-8 transition-all duration-500 hover:shadow-2xl">
        <div class="lg:w-1/3 flex flex-col gap-4">
          <div class="relative overflow-hidden rounded-3xl aspect-[4/5] soft-ui-inset">
            <img alt="${pick.name}" class="w-full h-full object-cover mix-blend-multiply opacity-90" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC-X_WNV5ruDhDL7LxI0nsmnDFaGUGVUWxAIRZR3Ld8RZskmqrFXk-ZHSLOnhXXfP1_fpjnN0YBM_vfZm3wOZbUajj34uUnXdlXcz-sHn40-qxTDvHLL7u6dbO464OyBKyTZZw3FChlKJvgZfjDQbzHqpNCgpSxg_3gZfAfm9hcdQU6iEAoAOt9JY0Es4oFcLN-VUAq7KIFwt-YWyx3n8GuM9diIfPKU6z1MLpWiLcOjS5dsruR6aNnLg15ase2nnvYjBurRmeLVAgB"/>
          </div>
          <div class="inner-card-section p-5 rounded-2xl">
            <h4 class="text-[10px] font-black uppercase tracking-widest text-accent mb-4">${language === 'chinese' ? '咖啡信息' : 'COFFEE PROFILE'}</h4>
            <div class="space-y-3">
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '烘焙商' : 'Roaster'}</p>
                <p class="text-xs font-bold text-primary">${pick.roaster}</p>
              </div>
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '产地' : 'Origin'}</p>
                <p class="text-xs font-bold text-primary">${pick.origin}</p>
              </div>
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '品种' : 'Variety'}</p>
                <p class="text-xs font-bold text-primary">${pick.variety}</p>
              </div>
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '处理法' : 'Process'}</p>
                <p class="text-xs font-bold text-primary">${pick.process}</p>
              </div>
              <div>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${language === 'chinese' ? '烘焙度' : 'Roast'}</p>
                <p class="text-xs font-bold text-primary">${pick.roast}</p>
              </div>
            </div>
          </div>
        </div>
        <div class="lg:w-2/3 flex flex-col">
          <div class="flex justify-between items-start mb-6">
            <div>
              <h3 class="text-2xl font-extrabold text-primary leading-tight"><a href="${pick.url}" target="_blank" class="hover:text-accent transition-colors">${pick.name}</a></h3>
              <p class="text-sm font-medium text-slate-400 italic">${language === 'chinese' ? '意式咖啡' : 'Espresso Method'}</p>
            </div>
            <span class="text-2xl font-black text-primary">${pick.price}</span>
          </div>
          <div class="inner-card-section p-6 rounded-3xl mb-4">
            <p class="text-[10px] font-black uppercase tracking-widest text-accent mb-3">${language === 'chinese' ? '入手理由' : 'WHY GET THIS'}</p>
            <ul class="list-disc list-inside space-y-2">
              ${pick.whyGet.map(reason => `<li class="text-sm text-slate-600 leading-relaxed">${reason}</li>`).join('\n              ')}
            </ul>
          </div>
          <div class="inner-card-section p-6 rounded-3xl mb-6">
            <p class="text-[10px] font-black uppercase tracking-widest text-accent mb-3">${language === 'chinese' ? '风味档案' : 'FLAVOR PROFILE'}</p>
            ${pick.varietyCharacter ? `<p class="text-sm text-slate-600 leading-relaxed mb-2">${pick.varietyCharacter}</p>` : ''}
            <p class="text-sm font-medium text-slate-700">${pick.flavorDescription}</p>
          </div>
          <div class="mt-auto">
            <div class="flex items-center gap-2 mb-4">
              <span class="material-symbols-outlined text-accent text-lg">electric_bolt</span>
              <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">${language === 'chinese' ? '冲煮参考' : 'Brew Guide'}: <span class="text-slate-400 font-medium">${pick.brewRatio} | ${pick.brewTemp} | ${pick.brewGrind}</span></p>
            </div>
            <a href="${pick.url}" target="_blank" class="soft-ui-button w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] text-accent hover:text-white hover:bg-accent transition-all block text-center">
              ${language === 'chinese' ? '查看详情' : 'View Full Profile'}
            </a>
          </div>
        </div>
      </div>
    `;

    $('section').eq(2).find('.grid.grid-cols-1.xl\\:grid-cols-2.gap-12').append(card);
  });

  // Hide espresso section if no espresso picks
  if (data.espressoPicks.length === 0) {
    $('section').eq(2).remove();
  }

  // Replace comparison table section with narrative "How to Choose"
  const quickGuideSection = $('section').last();  // Last section (after pour over and espresso)
  if (data.howToChoose) {
    quickGuideSection.find('h3').text(language === 'chinese' ? '怎么选' : 'How to Choose');
    quickGuideSection.find('p').first().remove();  // Remove "At-a-glance summary" text
    quickGuideSection.find('.overflow-x-auto').replaceWith(`
      <div class="inner-card-section p-8 rounded-3xl">
        <p class="text-base text-slate-700 leading-relaxed">${data.howToChoose}</p>
      </div>
    `);
  }

  return $.html();
}

// Main conversion function
function convertMarkdownToHTML(mdPath) {
  console.log(`Converting: ${mdPath}`);

  const content = fs.readFileSync(mdPath, 'utf8');
  const language = mdPath.includes('chinese') ? 'chinese' : 'english';

  // Extract date from path: posts/YYYY-MM-DD/chinese.md
  const dateMatch = mdPath.match(/posts\/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

  const data = parseMarkdown(content);
  const html = generateHTML(data, language, date);

  const htmlPath = mdPath.replace('.md', '.html');
  fs.writeFileSync(htmlPath, html);

  console.log(`Generated: ${htmlPath}`);
}

// Run conversion
if (require.main === module) {
  const postsDir = 'posts';

  if (!fs.existsSync(postsDir)) {
    console.log('No posts directory found');
    process.exit(0);
  }

  const markdownFiles = findMarkdownFiles(postsDir);

  if (markdownFiles.length === 0) {
    console.log('No markdown files found');
    process.exit(0);
  }

  markdownFiles.forEach(file => {
    convertMarkdownToHTML(file);
  });

  console.log(`\nConverted ${markdownFiles.length} files successfully!`);
}

module.exports = { parseMarkdown, generateHTML };
