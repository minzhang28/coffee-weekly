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
    if (line.match(/^## (?:怎么选|挑选建议|How to Choose)/)) {
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
        imageUrl: '',  // Will be extracted from next line if present
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

      // Check next line(s) for image URL (skip blank lines)
      let lookAhead = 1;
      while (i + lookAhead < lines.length && lookAhead <= 3) {
        const nextLine = lines[i + lookAhead].trim();
        if (!nextLine) {
          // Skip blank lines
          lookAhead++;
          continue;
        }
        const imageMatch = nextLine.match(/^!\[.*?\]\((.+?)\)/);
        if (imageMatch) {
          currentPick.imageUrl = imageMatch[1];
          i += lookAhead; // Skip ahead to the image line
          break;
        }
        // If we hit a non-image, non-blank line, stop looking
        break;
      }

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
function generateHTML(data, language, date, allDates) {
  const template = fs.readFileSync('template.html', 'utf8');
  const $ = cheerio.load(template);

  // Remove header nav
  $('header').remove();

  // Remove footer
  $('footer').remove();

  // Add language toggle and navigation bar
  const otherLanguage = language === 'chinese' ? 'english' : 'chinese';
  const otherLanguageLabel = language === 'chinese' ? 'English' : '中文';

  // Find previous and next dates
  const currentIndex = allDates.indexOf(date);
  const prevDate = currentIndex < allDates.length - 1 ? allDates[currentIndex + 1] : null;
  const nextDate = currentIndex > 0 ? allDates[currentIndex - 1] : null;

  const navBar = `
    <div style="position: sticky; top: 0; z-index: 1000; background: rgba(240, 242, 245, 0.95); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(0,0,0,0.05); padding: 1rem 2rem;">
      <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; gap: 1rem;">
          ${prevDate ? `<a href="../${prevDate}/${language}.html" style="padding: 0.5rem 1rem; background: #F0F2F5; border-radius: 0.5rem; box-shadow: 4px 4px 8px #d1d9e6, -4px -4px 8px #ffffff; color: #4A3728; text-decoration: none; font-weight: 600; font-size: 0.875rem;">← ${language === 'chinese' ? '上期' : 'Previous'}</a>` : ''}
          ${nextDate ? `<a href="../${nextDate}/${language}.html" style="padding: 0.5rem 1rem; background: #F0F2F5; border-radius: 0.5rem; box-shadow: 4px 4px 8px #d1d9e6, -4px -4px 8px #ffffff; color: #4A3728; text-decoration: none; font-weight: 600; font-size: 0.875rem;">${language === 'chinese' ? '下期' : 'Next'} →</a>` : ''}
        </div>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <label class="flex items-center gap-4 cursor-pointer" style="display: flex; align-items: center; gap: 1rem; cursor: pointer;">
            <span class="lang-label lang-en text-[11px] font-black tracking-widest text-primary embossed-text" style="font-size: 0.6875rem; font-weight: 900; letter-spacing: 0.1em; color: #4A3728; text-shadow: 0px 1px 1px rgba(255, 255, 255, 0.7); ${language === 'english' ? 'opacity: 1;' : 'opacity: 0.3; color: #94a3b8;'} transition: all 0.3s ease;">EN</span>
            <a href="${otherLanguage}.html" class="toggle-track" style="background: #F0F2F5; box-shadow: inset 4px 4px 8px rgba(174, 174, 192, 0.4), inset -4px -4px 8px #ffffff; border-radius: 2rem; padding: 4px; width: 80px; height: 38px; display: flex; align-items: center; position: relative; cursor: pointer; text-decoration: none;">
              <div class="toggle-thumb" style="width: 32px; height: 30px; background: #ec6d13; border-radius: 1rem; box-shadow: 4px 4px 10px rgba(236, 109, 19, 0.4), -2px -2px 6px rgba(255, 255, 255, 0.6), inset 2px 2px 4px rgba(255, 255, 255, 0.4), inset -2px -2px 4px rgba(0, 0, 0, 0.1); border: 1px solid rgba(255, 255, 255, 0.3); position: absolute; ${language === 'english' ? 'left: 4px;' : 'left: 42px;'} transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);"></div>
            </a>
            <span class="lang-label lang-ch text-[11px] font-black tracking-widest text-primary embossed-text" style="font-size: 0.6875rem; font-weight: 900; letter-spacing: 0.1em; color: #4A3728; text-shadow: 0px 1px 1px rgba(255, 255, 255, 0.7); ${language === 'chinese' ? 'opacity: 1;' : 'opacity: 0.3; color: #94a3b8;'} transition: all 0.3s ease;">CH</span>
          </label>
        </div>
      </div>
    </div>
  `;

  $('body > div').prepend(navBar);

  // Update title
  $('title').text(data.title || 'Weekly Coffee Report');

  // Format date badge (e.g., "2026 Feb 07")
  const [year, month, day] = date.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDate = `${year} ${monthNames[parseInt(month) - 1]} ${day}`;

  // Replace placeholders in hero section
  let heroHTML = $('section').eq(0).html();

  const selectionStory = language === 'chinese'
    ? '每一周我们都会从温哥华各大烘焙商处收集新鲜咖啡豆数据，根据烘焙方式，烘焙时间，产区，豆种以及处理方式和季节，帮你精选出最值得入手的手冲和意式个两款精品咖啡豆，希望能帮助你选择你喜欢的口味。'
    : 'Every week, we gather fresh coffee data from roasters across Vancouver. Based on roast style and date, origin, varietal, processing method, and seasonality, we select four standout specialty coffees—two for pour-over and two for espresso. The goal is simple: to help you find flavors you\'ll genuinely enjoy.';

  const currentFocusLabel = language === 'chinese' ? '本周主题' : 'Theme of the week';
  const themeIntro = language === 'chinese' ? '' : '';

  // Use full theme text without truncation
  const themeText = data.theme || (language === 'chinese' ? '精选时令咖啡' : 'Peak Season Performers');

  heroHTML = heroHTML
    .replace('{{ date_badge }}', formattedDate)
    .replace('{{ selection_story }}', selectionStory)
    .replace('{{ current_focus_label }}', currentFocusLabel)
    .replace('{{ theme_intro }}', themeIntro)
    .replace('{{ theme_text }}', themeText);

  $('section').eq(0).html(heroHTML);

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
        <!-- Name section - always first on mobile, hidden duplicate on desktop -->
        <div class="order-1 lg:hidden w-full mb-6">
          <h3 class="text-2xl font-extrabold text-primary leading-tight"><a href="${pick.url}" target="_blank" class="hover:text-accent transition-colors">${pick.name}</a></h3>
          <p class="text-sm font-medium text-slate-400 italic">${pick.price}</p>
        </div>

        <!-- Image/Profile section - second on mobile, first column on desktop -->
        <div class="order-2 lg:order-1 lg:w-1/3 flex flex-col gap-4">
          <div class="relative overflow-hidden rounded-3xl aspect-[4/5] soft-ui-inset">
            <img alt="${pick.name}" class="w-full h-full object-cover mix-blend-multiply opacity-90" src="${pick.imageUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuC-X_WNV5ruDhDL7LxI0nsmnDFaGUGVUWxAIRZR3Ld8RZskmqrFXk-ZHSLOnhXXfP1_fpjnN0YBM_vfZm3wOZbUajj34uUnXdlXcz-sHn40-qxTDvHLL7u6dbO464OyBKyTZZw3FChlKJvgZfjDQbzHqpNCgpSxg_3gZfAfm9hcdQU6iEAoAOt9JY0Es4oFcLN-VUAq7KIFwt-YWyx3n8GuM9diIfPKU6z1MLpWiLcOjS5dsruR6aNnLg15ase2nnvYjBurRmeLVAgB'}"/>
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

        <!-- Content section - third on mobile, second column on desktop -->
        <div class="order-3 lg:order-2 lg:w-2/3 flex flex-col">
          <!-- Name - only shown on desktop -->
          <div class="hidden lg:block mb-6">
            <h3 class="text-2xl font-extrabold text-primary leading-tight"><a href="${pick.url}" target="_blank" class="hover:text-accent transition-colors">${pick.name}</a></h3>
            <p class="text-sm font-medium text-slate-400 italic">${pick.price}</p>
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
              <p class="text-xs font-bold text-slate-500 tracking-widest"><span class="uppercase">${language === 'chinese' ? '冲煮参考' : 'brew guide'}</span>: <span class="text-slate-400 font-medium lowercase">${pick.brewRatio} | ${pick.brewTemp} | ${pick.brewGrind}</span></p>
            </div>
            <a href="${pick.url}" target="_blank" class="tactile-button-track group" style="text-decoration: none; display: flex;">
              <div class="tactile-button-pill">
                <span class="text-xs font-black uppercase tracking-[0.2em] embossed-text">${language === 'chinese' ? '去看看' : 'GET IT'}</span>
              </div>
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
        <!-- Name section - always first on mobile, hidden duplicate on desktop -->
        <div class="order-1 lg:hidden w-full mb-6">
          <h3 class="text-2xl font-extrabold text-primary leading-tight"><a href="${pick.url}" target="_blank" class="hover:text-accent transition-colors">${pick.name}</a></h3>
          <p class="text-sm font-medium text-slate-400 italic">${pick.price}</p>
        </div>

        <!-- Image/Profile section - second on mobile, first column on desktop -->
        <div class="order-2 lg:order-1 lg:w-1/3 flex flex-col gap-4">
          <div class="relative overflow-hidden rounded-3xl aspect-[4/5] soft-ui-inset">
            <img alt="${pick.name}" class="w-full h-full object-cover mix-blend-multiply opacity-90" src="${pick.imageUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuC-X_WNV5ruDhDL7LxI0nsmnDFaGUGVUWxAIRZR3Ld8RZskmqrFXk-ZHSLOnhXXfP1_fpjnN0YBM_vfZm3wOZbUajj34uUnXdlXcz-sHn40-qxTDvHLL7u6dbO464OyBKyTZZw3FChlKJvgZfjDQbzHqpNCgpSxg_3gZfAfm9hcdQU6iEAoAOt9JY0Es4oFcLN-VUAq7KIFwt-YWyx3n8GuM9diIfPKU6z1MLpWiLcOjS5dsruR6aNnLg15ase2nnvYjBurRmeLVAgB'}"/>
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

        <!-- Content section - third on mobile, second column on desktop -->
        <div class="order-3 lg:order-2 lg:w-2/3 flex flex-col">
          <!-- Name - only shown on desktop -->
          <div class="hidden lg:block mb-6">
            <h3 class="text-2xl font-extrabold text-primary leading-tight"><a href="${pick.url}" target="_blank" class="hover:text-accent transition-colors">${pick.name}</a></h3>
            <p class="text-sm font-medium text-slate-400 italic">${pick.price}</p>
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
              <p class="text-xs font-bold text-slate-500 tracking-widest"><span class="uppercase">${language === 'chinese' ? '冲煮参考' : 'brew guide'}</span>: <span class="text-slate-400 font-medium lowercase">${pick.brewRatio} | ${pick.brewTemp} | ${pick.brewGrind}</span></p>
            </div>
            <a href="${pick.url}" target="_blank" class="tactile-button-track group" style="text-decoration: none; display: flex;">
              <div class="tactile-button-pill">
                <span class="text-xs font-black uppercase tracking-[0.2em] embossed-text">${language === 'chinese' ? '去看看' : 'GET IT'}</span>
              </div>
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

  // Update "How to Choose" section with content from markdown
  const quickGuideSection = $('section').last();  // Last section (after pour over and espresso)
  if (data.howToChoose) {
    quickGuideSection.find('h3').text(language === 'chinese' ? '挑选建议' : 'How to Choose');
    // Replace the placeholder text in the inner-card-section
    quickGuideSection.find('.inner-card-section p').text(data.howToChoose.trim());
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

  const allDates = getAllDates();
  const data = parseMarkdown(content);
  const html = generateHTML(data, language, date, allDates);

  const htmlPath = mdPath.replace('.md', '.html');
  fs.writeFileSync(htmlPath, html);

  console.log(`Generated: ${htmlPath}`);
}

// Get all available dates
function getAllDates() {
  const postsDir = 'posts';
  if (!fs.existsSync(postsDir)) return [];

  const items = fs.readdirSync(postsDir, { withFileTypes: true });
  const dates = items
    .filter(item => item.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(item.name))
    .map(item => item.name)
    .sort()
    .reverse(); // Most recent first

  return dates;
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

  const allDates = getAllDates();

  markdownFiles.forEach(file => {
    convertMarkdownToHTML(file);
  });

  console.log(`\nConverted ${markdownFiles.length} files successfully!`);

  // Create index.html that redirects to latest English report
  if (allDates.length > 0) {
    const latestDate = allDates[0];
    const indexContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=posts/${latestDate}/english.html">
  <title>Redirecting to Latest Report...</title>
</head>
<body>
  <p>Redirecting to latest report... <a href="posts/${latestDate}/english.html">Click here if not redirected</a></p>
</body>
</html>`;

    fs.writeFileSync('index.html', indexContent);
    console.log(`Created index.html → redirects to posts/${latestDate}/english.html`);
  }

  // Create archive.html listing all reports
  if (allDates.length > 0) {
    const archiveContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Archive | Vancouver Coffee Weekly</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>
<style>
:root {
  --primary: #4A3728;
  --accent: #ec6d13;
  --soft-bg: #F0F2F5;
}
body {
  margin: 0;
  padding: 0;
  font-family: "Plus Jakarta Sans", sans-serif;
  background: radial-gradient(circle at top left, #F8FAFC 0%, #F0F2F5 100%);
  min-height: 100vh;
  color: #2D3436;
}
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 60px 20px;
}
h1 {
  font-size: 2.5rem;
  font-weight: 800;
  color: var(--primary);
  text-align: center;
  margin-bottom: 3rem;
}
.report-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.report-item {
  background: #F0F2F5;
  border-radius: 1.5rem;
  padding: 1.5rem 2rem;
  box-shadow: 8px 8px 16px #d1d9e6, -8px -8px 16px #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: transform 0.2s;
}
.report-item:hover {
  transform: translateX(5px);
}
.report-date {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary);
}
.report-links {
  display: flex;
  gap: 1rem;
}
.report-link {
  padding: 0.5rem 1.5rem;
  background: #F0F2F5;
  border-radius: 0.75rem;
  box-shadow: 4px 4px 8px #d1d9e6, -4px -4px 8px #ffffff;
  color: var(--accent);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.875rem;
  transition: all 0.2s;
}
.report-link:hover {
  color: white;
  background: var(--accent);
}
.back-link {
  display: inline-block;
  margin-bottom: 2rem;
  color: #666;
  text-decoration: none;
  font-weight: 600;
}
.back-link:hover {
  color: var(--accent);
}
</style>
</head>
<body>
<div class="container">
  <a href="/" class="back-link">← Back to Latest</a>
  <h1>Report Archive</h1>
  <div class="report-list">
${allDates.map(date => {
  const [year, month, day] = date.split('-');
  const dateObj = new Date(year, month - 1, day);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  return `    <div class="report-item">
      <div class="report-date">${formattedDate}</div>
      <div class="report-links">
        <a href="posts/${date}/chinese.html" class="report-link">中文</a>
        <a href="posts/${date}/english.html" class="report-link">English</a>
      </div>
    </div>`;
}).join('\n')}
  </div>
</div>
</body>
</html>`;

    fs.writeFileSync('archive.html', archiveContent);
    console.log(`Created archive.html with ${allDates.length} reports`);
  }
}

module.exports = { parseMarkdown, generateHTML };
