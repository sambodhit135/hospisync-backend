import codecs

file_path = 'src/main/resources/static/js/transfer.js'

with codecs.open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

new_lines = []
in_target = False
for line in lines:
    if line.startswith('function renderDynamicBedInputs'):
        in_target = True
        
        # Inject our brand new completely rewritten function
        new_fn = """function renderDynamicBedInputs(categories) {
    const container = document.getElementById('transferBedTypesContainer');
    
    if (!categories || categories.length === 0) {
        container.innerHTML = '<div style="grid-column: span 2; padding: 20px; text-align: center; color: var(--warning);">This hospital has no registered bed categories.</div>';
        return;
    }

    // Filter categories to only show those that have a requirement > 0 in the dashboard
    const filteredCategories = categories.filter(cat => {
        const name = cat.categoryName || cat.name;
        const reqInput = document.getElementById(`req-${name}`);
        return (parseInt(reqInput?.value) || 0) > 0;
    });

    // If no specific requirements were set, show all available
    const displayList = filteredCategories.length > 0 ? filteredCategories : categories;

    container.innerHTML = displayList.map((cat, index) => {
        const name = cat.categoryName || cat.name;
        const reqInput = document.getElementById(`req-${name}`);
        const defaultVal = parseInt(reqInput?.value) || 0;

        return `
            <div class="space-y-2">
                <label class="text-[10px] font-black text-slate-400 border-l-2 border-primary/20 pl-2 uppercase tracking-widest block">${cat.icon || '🏥'} ${name} <span class="lowercase text-[9px] text-slate-300">(Avail: ${cat.available})</span></label>
                <div class="relative">
                    <input type="number" 
                           id="input_cat_${index}" 
                           data-available="${cat.available}"
                           data-name="${name}"
                           class="w-full bg-slate-50 border-none rounded-xl py-4 px-5 text-sm font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                           min="0" 
                           max="${cat.available}"
                           value="${defaultVal}" 
                           oninput="onBedInput(this)">
                    <span class="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">UNITS</span>
                </div>
            </div>
        `;
    }).join('');
    
    // Calculate total immediately after rendering to show pre-filled total
    if (typeof calcTransferTotal === 'function') {
        calcTransferTotal();
    }
}
"""
        new_lines.append(new_fn)
        continue
        
    if in_target:
        if line.startswith('}'):
            in_target = False
        continue
        
    new_lines.append(line)

with codecs.open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("transfer.js UI function patched successfully")
