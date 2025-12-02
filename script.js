// ============================================
// ACADEMIC SOURCE FINDER V2 - AI-POWERED
// ============================================

// API Configuration for Academic Sources
const API_CONFIG = {
    semanticScholar: {
        baseUrl: 'https://api.semanticscholar.org/graph/v1/paper/search',
        fields: 'paperId,title,abstract,authors,year,citationCount,openAccessPdf,url,venue,publicationDate',
        limit: 20
    },
    crossref: {
        baseUrl: 'https://api.crossref.org/works',
        mailto: 'research@academic-finder.com',
        limit: 20
    },
    arxiv: {
        baseUrl: 'http://export.arxiv.org/api/query',
        limit: 20
    }
};

// AI Provider Configurations
const AI_PROVIDERS = {
    'gemini': {
        name: 'Google Gemini 2.0 Flash',
        model: 'gemini-2.0-flash',
        maxTokens: 8192
    },
    'gemini-pro': {
        name: 'Google Gemini 1.5 Pro',
        model: 'gemini-1.5-pro',
        maxTokens: 8192
    },
    'openai': {
        name: 'OpenAI GPT-4o',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o',
        maxTokens: 16000
    },
    'openai-mini': {
        name: 'OpenAI GPT-4o-mini',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        maxTokens: 16000
    },
    'anthropic': {
        name: 'Anthropic Claude',
        endpoint: 'https://api.anthropic.com/v1/messages',
        model: 'claude-sonnet-4-20250514',
        maxTokens: 8000
    }
};

// State Management
let currentResults = [];
let selectedSources = [];
let currentFilters = {
    yearMin: null,
    yearMax: null,
    minCitations: 0,
    openAccessOnly: false,
    source: 'all'
};
let currentSort = 'relevance';
let isGenerating = false;
let abortController = null;

// ============================================
// SOURCE PERSISTENCE
// ============================================

function saveSourcestoStorage() {
    try {
        localStorage.setItem('selectedSources', JSON.stringify(selectedSources));
    } catch (error) {
        console.error('Failed to save sources:', error);
    }
}

function loadSourcesFromStorage() {
    try {
        const saved = localStorage.getItem('selectedSources');
        if (saved) {
            selectedSources = JSON.parse(saved);
            updateSourcesUI();
        }
    } catch (error) {
        console.error('Failed to load sources:', error);
        selectedSources = [];
    }
}

function clearAllSources() {
    if (selectedSources.length === 0) {
        showToast('No sources to clear');
        return;
    }
    
    if (confirm(`Clear all ${selectedSources.length} sources?`)) {
        selectedSources = [];
        saveSourcestoStorage();
        updateSourcesUI();
        displayResults(currentResults);
        showToast('All sources cleared');
    }
}

// DOM Elements - Search
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsSection = document.getElementById('resultsSection');
const resultsContainer = document.getElementById('resultsContainer');
const resultsCount = document.getElementById('resultsCount');
const loadingIndicator = document.getElementById('loadingIndicator');
const sortSelect = document.getElementById('sortSelect');

// DOM Elements - Navigation & Panels
const navTabs = document.querySelectorAll('.nav-tab');
const viewSections = document.querySelectorAll('.view-section');
const sourcesToggleBtn = document.getElementById('sourcesToggleBtn');
const sourcesPanel = document.getElementById('sourcesPanel');
const closePanelBtn = document.getElementById('closePanelBtn');
const panelSourcesList = document.getElementById('panelSourcesList');
const floatingSourceCount = document.getElementById('floatingSourceCount');
const goToWriterBtn = document.getElementById('goToWriterBtn');

// DOM Elements - Essay Writer
const writerSourcesList = document.getElementById('writerSourcesList');
const writerSourceCount = document.getElementById('writerSourceCount');
const generateDraftBtn = document.getElementById('generateDraftBtn');
const stopGenerationBtn = document.getElementById('stopGenerationBtn');
const draftOutput = document.getElementById('draftOutput');
const essayTopic = document.getElementById('essayTopic');
const essayLength = document.getElementById('essayLength');
const essayStyle = document.getElementById('essayStyle');
const writerActions = document.getElementById('writerActions');
const copyDraftBtn = document.getElementById('copyDraftBtn');
const downloadDraftBtn = document.getElementById('downloadDraftBtn');

// DOM Elements - AI Config
const aiProvider = document.getElementById('aiProvider');
const apiKeyInput = document.getElementById('apiKey');
const toggleApiKey = document.getElementById('toggleApiKey');

// DOM Elements - Modal
const addManualSourceBtn = document.getElementById('addManualSourceBtn');
const manualSourceModal = document.getElementById('manualSourceModal');
const saveManualSourceBtn = document.getElementById('saveManualSourceBtn');
const cancelManualSourceBtn = document.getElementById('cancelManualSourceBtn');

// ============================================
// API KEY MANAGEMENT
// ============================================

function saveApiKey() {
    const provider = aiProvider.value;
    const key = apiKeyInput.value.trim();
    if (key && !key.includes('Demo Key')) {
        localStorage.setItem(`apiKey_${provider}`, key);
        // If user manually enters a key, it's not a demo key
        if (!usingDemoAiKey) {
            localStorage.removeItem(`apiKey_${provider}_isDemo`);
        }
        usingDemoAiKey = false;
    }
}

function loadApiKey() {
    const provider = aiProvider.value;
    const savedKey = localStorage.getItem(`apiKey_${provider}`);
    const isDemo = localStorage.getItem(`apiKey_${provider}_isDemo`) === 'true';
    
    if (savedKey) {
        apiKeyInput.value = savedKey;
        usingDemoAiKey = isDemo;
    } else {
        apiKeyInput.value = '';
        usingDemoAiKey = false;
    }
    
    // Reset visibility state
    apiKeyInput.type = 'password';
    apiKeyInput.readOnly = false;
    if (toggleApiKey) toggleApiKey.textContent = '👁';
}

function toggleApiKeyVisibility() {
    const provider = aiProvider?.value || 'gemini';
    const isDemo = localStorage.getItem(`apiKey_${provider}_isDemo`) === 'true';
    
    if (apiKeyInput.type === 'password') {
        if (isDemo) {
            // Show masked version for demo keys
            apiKeyInput.dataset.realValue = apiKeyInput.value;
            apiKeyInput.value = '●●●●●●●● (Demo Key - Protected)';
            apiKeyInput.type = 'text';
            apiKeyInput.readOnly = true;
        } else {
            apiKeyInput.type = 'text';
        }
        toggleApiKey.textContent = '🔒';
    } else {
        if (isDemo && apiKeyInput.dataset.realValue) {
            apiKeyInput.value = apiKeyInput.dataset.realValue;
            apiKeyInput.readOnly = false;
        }
        apiKeyInput.type = 'password';
        toggleApiKey.textContent = '👁';
    }
}

// ============================================
// AI ESSAY GENERATION
// ============================================

function buildEssayPrompt(topic, sources, length, style, citationFormat, humanizeMode = false) {
    const wordCounts = { short: 500, medium: 1500, long: 3000 };
    const targetWords = wordCounts[length];
    
    const styleInstructions = {
        academic: 'Write in a formal academic tone with proper scholarly conventions. Use third person, passive voice where appropriate, and maintain objectivity.',
        argumentative: 'Write a persuasive essay that takes a clear position and argues it convincingly with evidence. Use strong topic sentences and logical progression.',
        analytical: 'Write an analytical essay that breaks down the topic into components, examines relationships, and provides deep insights. Focus on the "how" and "why".',
        expository: 'Write an explanatory essay that clearly presents information and explains the topic. Be informative and educational.',
        narrative: 'Write in a more engaging narrative style while maintaining academic credibility. Use storytelling elements where appropriate.'
    };

    const citationInstructions = {
        apa7: {
            name: 'APA 7th Edition',
            inText: '(Author, Year) for paraphrasing or (Author, Year, p. X) for direct quotes',
            refExample: 'Author, A. A. (Year). Title of work. Publisher. https://doi.org/xxxxx'
        },
        mla9: {
            name: 'MLA 9th Edition', 
            inText: '(Author Page) - e.g., (Smith 45) or (Smith and Jones 23)',
            refExample: 'Author. "Title of Article." Journal Name, vol. X, no. X, Year, pp. X-X.'
        },
        chicago: {
            name: 'Chicago/Turabian',
            inText: 'Footnotes with superscript numbers¹ (notes-bibliography style) OR (Author Year, Page) for author-date style',
            refExample: 'Author. Title. Place: Publisher, Year.'
        },
        harvard: {
            name: 'Harvard',
            inText: '(Author Year) or (Author Year, p. X) for direct quotes',
            refExample: 'Author, A.A. Year. Title of work. City: Publisher.'
        },
        ieee: {
            name: 'IEEE',
            inText: 'Numbered references in square brackets [1], [2], [3] in order of appearance',
            refExample: '[1] A. Author, "Title," Journal, vol. X, no. X, pp. X-X, Year.'
        },
        ama: {
            name: 'AMA (American Medical Association)',
            inText: 'Superscript numbers¹²³ in order of appearance',
            refExample: '1. Author AA. Title of article. Journal Name. Year;Volume(Issue):Pages.'
        }
    };

    const citation = citationInstructions[citationFormat] || citationInstructions.apa7;

    const sourcesContext = sources.map((s, i) => {
        return `Source ${i + 1}:
- Title: "${s.title}"
- Authors: ${s.authors || 'Unknown'}
- Year: ${s.year || 'n.d.'}
- Venue: ${s.venue || s.source || 'Unknown'}
${s.abstract ? `- Abstract: ${s.abstract.substring(0, 500)}...` : ''}`;
    }).join('\n\n');

    // Humanization instructions to avoid AI detection
    const humanizeInstructions = humanizeMode ? `

CRITICAL - HUMANIZE YOUR WRITING (avoid AI detection):
You MUST write in a way that appears naturally human-written and avoids common AI writing patterns:

1. AVOID THESE AI-FLAGGED PHRASES (never use them):
   - "It is important to note", "It is worth noting", "It should be noted"
   - "In today's world", "In the modern era", "In contemporary society"
   - "Plays a crucial role", "Plays an important role", "Plays a significant role"
   - "Delve into", "Dive deep", "Explore the intricacies"
   - "Comprehensive overview", "Holistic approach", "Multifaceted"
   - "Paramount", "Pivotal", "Underscores", "Myriad", "Plethora"
   - "Furthermore", "Moreover", "Additionally" (use sparingly, max 1-2 times total)
   - "In conclusion", "To summarize", "In summary" (find unique ways to conclude)

2. SENTENCE VARIETY (critical for human-like writing):
   - Mix short punchy sentences (5-10 words) with medium (15-20) and occasional long ones (25-35)
   - Start sentences differently - avoid starting multiple sentences with "This", "It", "The", or "There"
   - Use questions occasionally to engage the reader
   - Include a one-sentence paragraph for emphasis somewhere in the essay

3. VOCABULARY & STYLE:
   - Use contractions naturally (don't, isn't, won't, can't) - at least 3-5 times
   - Vary your word choices - don't repeat the same adjectives/adverbs
   - Use concrete, specific examples rather than abstract generalizations
   - Include occasional informal phrases that sound natural ("The truth is...", "Here's the thing:", "What's interesting is...")
   - Use active voice more than passive voice

4. STRUCTURE:
   - Don't make every paragraph the same length - vary between 3-7 sentences
   - Occasionally use a transitional phrase MID-sentence rather than at the start
   - Include at least one rhetorical question
   - Add a surprising fact, statistic, or counterintuitive point

5. NATURAL IMPERFECTIONS:
   - It's okay to start a sentence with "And" or "But" occasionally
   - Use em-dashes for asides—like this—instead of always using commas
   - Include a brief personal observation or interpretation (while citing sources)

Remember: Write like a knowledgeable human student, not a language model. Sound authentic and engaged with the topic.
` : '';

    return `You are an expert academic writer. Write a comprehensive, well-researched essay on the following topic.

TOPIC/PROMPT:
${topic}

SOURCES TO CITE (you MUST incorporate ALL of these sources with proper in-text citations):
${sourcesContext}

REQUIREMENTS:
- Target length: approximately ${targetWords} words
- Style: ${style} - ${styleInstructions[style]}
- Citation format: ${citation.name}
- In-text citation format: ${citation.inText}
- Include proper in-text citations for EVERY source used
- Structure the essay with clear sections: Introduction, Body paragraphs (with subheadings for longer essays), and Conclusion
- The introduction should hook the reader, provide context, and present a clear thesis statement
- Each body paragraph should have a topic sentence, evidence from sources, analysis, and transition
- Synthesize and compare sources rather than just summarizing them one by one
- The conclusion should summarize key points, restate the thesis in light of evidence, and suggest implications or future directions
- End with a References/Works Cited/Bibliography section formatted in ${citation.name}
- Reference format example: ${citation.refExample}
${humanizeInstructions}
IMPORTANT FORMATTING:
- Use markdown formatting for structure (# for title, ## for main sections, ### for subsections)
- Use **bold** for emphasis and *italics* for titles of works
- Write flowing, connected prose - not bullet points
- Ensure smooth transitions between paragraphs and sections
- Make the essay feel cohesive and well-argued, not like a collection of source summaries

Write the complete essay now:`;
}

async function generateWithOpenAI(prompt, apiKey, model) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert academic essay writer. You write comprehensive, well-structured essays that properly cite sources and demonstrate deep analysis. Your writing is clear, engaging, and academically rigorous.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 16000,
            temperature: 0.7,
            stream: true
        }),
        signal: abortController.signal
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    return response.body;
}

async function generateWithAnthropic(prompt, apiKey) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8000,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            system: 'You are an expert academic essay writer. You write comprehensive, well-structured essays that properly cite sources and demonstrate deep analysis. Your writing is clear, engaging, and academically rigorous.',
            stream: true
        }),
        signal: abortController.signal
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Anthropic API error');
    }

    return response.body;
}

async function generateWithGemini(prompt, apiKey, model) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: `You are an expert academic essay writer. You write comprehensive, well-structured essays that properly cite sources and demonstrate deep analysis. Your writing is clear, engaging, and academically rigorous.\n\n${prompt}`
                        }
                    ]
                }
            ],
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.7
            }
        }),
        signal: abortController.signal
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Gemini API error');
    }

    return response.body;
}

async function processOpenAIStream(reader, decoder) {
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        appendToOutput(content);
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        }
    }
}

async function processAnthropicStream(reader, decoder) {
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'content_block_delta') {
                        const content = parsed.delta?.text;
                        if (content) {
                            appendToOutput(content);
                        }
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        }
    }
}

async function processGeminiStream(reader, decoder) {
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (!data) continue;
                
                try {
                    const parsed = JSON.parse(data);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        appendToOutput(text);
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        }
    }
}

let outputBuffer = '';

function appendToOutput(text) {
    outputBuffer += text;
    // Convert markdown to HTML and display
    draftOutput.innerHTML = markdownToHtml(outputBuffer);
    // Auto-scroll to bottom
    draftOutput.scrollTop = draftOutput.scrollHeight;
}

function markdownToHtml(markdown) {
    let html = markdown
        // Escape HTML
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Headers
        .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold text-gold-200 mt-6 mb-3">$1</h3>')
        .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold text-gold-300 mt-8 mb-4">$1</h2>')
        .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-gold-400 mb-6 pb-2 border-b border-gold-400/20">$1</h1>')
        // Bold and italic
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gold-200">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Line breaks for paragraphs
        .replace(/\n\n/g, '</p><p class="mb-4 text-gold-100/90 leading-relaxed">')
        .replace(/\n/g, '<br>');
    
    // Wrap in paragraph tags
    html = '<p class="mb-4 text-gold-100/90 leading-relaxed">' + html + '</p>';
    
    // Clean up empty paragraphs
    html = html.replace(/<p class="[^"]*"><\/p>/g, '');
    html = html.replace(/<p class="[^"]*"><br><\/p>/g, '');
    
    return html;
}

async function generateDraft() {
    const topic = essayTopic.value.trim();
    const length = essayLength.value;
    const style = essayStyle?.value || 'academic';
    const citationFormat = document.getElementById('citationFormat')?.value || 'apa7';
    const humanizeMode = document.getElementById('humanizeMode')?.checked ?? true;
    const provider = aiProvider.value;
    const apiKey = apiKeyInput.value.trim();

    // Validation
    if (!apiKey) {
        showToast('Please enter your API key');
        apiKeyInput.focus();
        return;
    }

    if (!topic) {
        showToast('Please enter an essay topic');
        essayTopic.focus();
        return;
    }

    if (selectedSources.length === 0) {
        showToast('Please select at least one source');
        return;
    }

    // Save API key
    saveApiKey();

    // Track essay generation analytics
    if (window.Analytics) {
        window.Analytics.trackEvent('essay_generated', { 
            length: length, 
            style: style, 
            sources: selectedSources.length 
        });
    }

    // Set up UI for generation
    isGenerating = true;
    abortController = new AbortController();
    outputBuffer = '';
    
    generateDraftBtn.disabled = true;
    document.getElementById('generateBtnIcon').textContent = '⏳';
    document.getElementById('generateBtnText').textContent = 'Generating...';
    stopGenerationBtn.classList.remove('hidden');
    
    // Clear and prepare output
    draftOutput.innerHTML = '<p class="text-gold-200/60 animate-pulse">Starting AI generation...</p>';
    draftOutput.classList.remove('flex', 'items-center', 'justify-center', 'text-center', 'text-gray-500');
    draftOutput.classList.add('text-left');
    writerActions.classList.remove('hidden');

    try {
        const prompt = buildEssayPrompt(topic, selectedSources, length, style, citationFormat, humanizeMode);
        let stream;
        const model = AI_PROVIDERS[provider].model;
        
        if (provider === 'anthropic') {
            stream = await generateWithAnthropic(prompt, apiKey);
        } else if (provider === 'gemini' || provider === 'gemini-pro') {
            stream = await generateWithGemini(prompt, apiKey, model);
        } else {
            stream = await generateWithOpenAI(prompt, apiKey, model);
        }

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        
        // Clear the "Starting..." message
        draftOutput.innerHTML = '';
        
        if (provider === 'anthropic') {
            await processAnthropicStream(reader, decoder);
        } else if (provider === 'gemini' || provider === 'gemini-pro') {
            await processGeminiStream(reader, decoder);
        } else {
            await processOpenAIStream(reader, decoder);
        }

        showToast('Essay generated successfully!');

    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('Generation stopped');
            outputBuffer += '\n\n---\n*Generation was stopped by user*';
            draftOutput.innerHTML = markdownToHtml(outputBuffer);
        } else {
            console.error('Generation error:', error);
            draftOutput.innerHTML = `
                <div class="text-center py-12">
                    <div class="text-5xl mb-4">⚠️</div>
                    <h3 class="text-xl font-bold text-red-400 mb-2">Generation Failed</h3>
                    <p class="text-gold-200/60 mb-4">${error.message}</p>
                    <p class="text-sm text-gold-200/40">Please check your API key and try again.</p>
                </div>
            `;
            writerActions.classList.add('hidden');
        }
    } finally {
        isGenerating = false;
        abortController = null;
        generateDraftBtn.disabled = false;
        document.getElementById('generateBtnIcon').textContent = '✨';
        document.getElementById('generateBtnText').textContent = 'Generate with AI';
        stopGenerationBtn.classList.add('hidden');
    }
}

function stopGeneration() {
    if (abortController) {
        abortController.abort();
    }
}

// ============================================
// ESSAY REFINEMENT (Humanization)
// ============================================

async function refineEssay() {
    const currentEssay = draftOutput.innerText;
    const apiKey = apiKeyInput?.value?.trim();
    const provider = aiProvider?.value || 'gemini';
    
    if (!currentEssay || currentEssay.includes('AI-Powered Essay Writer')) {
        showToast('No essay to refine. Generate one first!');
        return;
    }
    
    if (!apiKey) {
        showToast('Please enter your API key first');
        return;
    }
    
    if (isGenerating) {
        showToast('Please wait for current generation to finish');
        return;
    }
    
    // Confirm with user
    if (!confirm('This will rewrite your essay to be more human-like and avoid AI detection patterns. Continue?')) {
        return;
    }
    
    isGenerating = true;
    abortController = new AbortController();
    
    // Update UI
    const refineBtn = document.getElementById('refineEssayBtn');
    if (refineBtn) {
        refineBtn.disabled = true;
        refineBtn.innerHTML = '<span>⏳</span> Humanizing...';
    }
    
    draftOutput.innerHTML = '<p class="text-emerald-400/60 animate-pulse text-center py-8">🛡️ Rewriting essay to be more human-like...</p>';
    
    const refinePrompt = buildRefinePrompt(currentEssay);
    
    try {
        let stream;
        const model = AI_PROVIDERS[provider]?.model || 'gemini-2.0-flash';
        
        if (provider === 'anthropic') {
            stream = await generateWithAnthropic(refinePrompt, apiKey);
        } else if (provider === 'gemini' || provider === 'gemini-pro') {
            stream = await generateWithGemini(refinePrompt, apiKey, model);
        } else {
            stream = await generateWithOpenAI(refinePrompt, apiKey, model);
        }
        
        outputBuffer = '';
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        
        draftOutput.innerHTML = '';
        
        if (provider === 'anthropic') {
            await processAnthropicStream(reader, decoder);
        } else if (provider === 'gemini' || provider === 'gemini-pro') {
            await processGeminiStream(reader, decoder);
        } else {
            await processOpenAIStream(reader, decoder);
        }
        
        showToast('Essay humanized! Check it in the Analyzer to verify.');
        
    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('Refinement stopped');
        } else {
            console.error('Refinement error:', error);
            showToast('Refinement failed: ' + error.message);
            // Restore original essay
            draftOutput.innerHTML = markdownToHtml(currentEssay);
        }
    } finally {
        isGenerating = false;
        abortController = null;
        if (refineBtn) {
            refineBtn.disabled = false;
            refineBtn.innerHTML = '<span>🛡️</span> Humanize';
        }
    }
}

function buildRefinePrompt(essay) {
    return `You are an expert editor specializing in making AI-written text sound more naturally human-written. Your task is to rewrite the following essay to avoid AI detection while preserving all the content, citations, and academic quality.

ORIGINAL ESSAY:
"""
${essay}
"""

REWRITE INSTRUCTIONS - You MUST apply ALL of these changes:

1. REMOVE/REPLACE AI-FLAGGED PHRASES:
   - Replace "It is important to note" → "Notice that" or "Consider this:" or just remove it
   - Replace "Furthermore/Moreover/Additionally" → "Also," "What's more," "Beyond this," or restructure the sentence
   - Replace "In conclusion" → "So what does this mean?" or "Looking at the bigger picture," or just transition naturally
   - Remove "plays a crucial/important role" → use specific verbs instead
   - Replace "In today's world/modern era" → be specific about time/context or remove
   - Replace "comprehensive/holistic" → "thorough" or "complete" or be specific
   - Never use: delve, myriad, plethora, paramount, pivotal, multifaceted, underscores

2. VARY SENTENCE STRUCTURE:
   - Add 2-3 very short sentences (5-8 words) for punch
   - Include 1-2 questions to engage the reader
   - Start at least 3 sentences with different words than "The," "This," "It," or "There"
   - Add one single-sentence paragraph for emphasis
   - Use em-dashes—like this—at least twice for asides

3. ADD NATURAL LANGUAGE ELEMENTS:
   - Include 4-6 contractions (don't, isn't, won't, can't, it's, that's)
   - Add 2-3 informal transitions ("Here's the thing:", "The truth is,", "What's interesting is")
   - Start 1-2 sentences with "And" or "But"
   - Include a brief personal interpretation (while still citing sources)

4. IMPROVE FLOW:
   - Vary paragraph lengths (some 3 sentences, some 5-6)
   - Move some transitions to mid-sentence instead of the start
   - Make the conclusion feel like a natural ending, not a formulaic wrap-up

5. KEEP THESE INTACT:
   - All citations and references (keep exact format)
   - The main arguments and thesis
   - Section headings and structure
   - Academic credibility and factual accuracy

OUTPUT FORMAT:
- Use the same markdown formatting as the original
- Keep all citations exactly as they were
- Maintain approximately the same length (±10%)

Now rewrite the essay to sound more naturally human while keeping all the academic content:`;
}

// ============================================
// ACADEMIC SOURCE API FUNCTIONS
// ============================================

async function fetchSemanticScholar(query) {
    try {
        const url = `${API_CONFIG.semanticScholar.baseUrl}?query=${encodeURIComponent(query)}&fields=${API_CONFIG.semanticScholar.fields}&limit=${API_CONFIG.semanticScholar.limit}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Semantic Scholar API error: ${response.status}`);
        const data = await response.json();
        return data.data.map(paper => ({
            id: paper.paperId || generateId(),
            title: paper.title || 'Untitled',
            authors: paper.authors?.map(a => a.name).join(', ') || 'Unknown',
            abstract: paper.abstract || 'No abstract available',
            year: paper.year || paper.publicationDate?.substring(0, 4) || null,
            citations: paper.citationCount || 0,
            url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
            pdfUrl: paper.openAccessPdf?.url || null,
            venue: paper.venue || 'Unknown',
            source: 'Semantic Scholar',
            doi: null,
            isOpenAccess: !!paper.openAccessPdf
        }));
    } catch (error) {
        console.error('Semantic Scholar fetch error:', error);
        return [];
    }
}

async function fetchCrossRef(query) {
    try {
        const url = `${API_CONFIG.crossref.baseUrl}?query=${encodeURIComponent(query)}&rows=${API_CONFIG.crossref.limit}&mailto=${API_CONFIG.crossref.mailto}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`CrossRef API error: ${response.status}`);
        const data = await response.json();
        return data.message.items.map(item => ({
            id: item.DOI || generateId(),
            title: item.title?.[0] || 'Untitled',
            authors: item.author?.map(a => `${a.given || ''} ${a.family || ''}`).join(', ') || 'Unknown',
            abstract: item.abstract || 'No abstract available',
            year: item.published?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0] || null,
            citations: item['is-referenced-by-count'] || 0,
            url: item.URL || `https://doi.org/${item.DOI}`,
            pdfUrl: item.link?.find(l => l['content-type'] === 'application/pdf')?.URL || null,
            venue: item['container-title']?.[0] || item.publisher || 'Unknown',
            source: 'CrossRef',
            doi: item.DOI,
            isOpenAccess: item.link?.some(l => l['content-type'] === 'application/pdf') || false
        }));
    } catch (error) {
        console.error('CrossRef fetch error:', error);
        return [];
    }
}

async function fetchArxiv(query) {
    try {
        const url = `${API_CONFIG.arxiv.baseUrl}?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${API_CONFIG.arxiv.limit}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`arXiv API error: ${response.status}`);
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
        const entries = xml.querySelectorAll('entry');
        return Array.from(entries).map(entry => {
            const id = entry.querySelector('id')?.textContent || '';
            const arxivId = id.split('/abs/')[1] || generateId();
            return {
                id: arxivId,
                title: entry.querySelector('title')?.textContent?.trim() || 'Untitled',
                authors: Array.from(entry.querySelectorAll('author name')).map(a => a.textContent).join(', ') || 'Unknown',
                abstract: entry.querySelector('summary')?.textContent?.trim() || 'No abstract available',
                year: entry.querySelector('published')?.textContent?.substring(0, 4) || null,
                citations: 0,
                url: id || '',
                pdfUrl: id ? id.replace('/abs/', '/pdf/') + '.pdf' : null,
                venue: 'arXiv',
                source: 'arXiv',
                doi: null,
                isOpenAccess: true
            };
        });
    } catch (error) {
        console.error('arXiv fetch error:', error);
        return [];
    }
}

// ============================================
// RESULT AGGREGATION & PROCESSING
// ============================================

async function aggregateResults(query) {
    showLoading(true);
    try {
        const cached = getCachedResults(query);
        if (cached) {
            currentResults = cached;
            displayResults(cached);
            showLoading(false);
            return;
        }
        const [semanticResults, crossrefResults, arxivResults] = await Promise.all([
            fetchSemanticScholar(query),
            fetchCrossRef(query),
            fetchArxiv(query)
        ]);
        const allResults = [...semanticResults, ...crossrefResults, ...arxivResults];
        const deduplicatedResults = deduplicateResults(allResults);
        cacheResults(query, deduplicatedResults);
        currentResults = deduplicatedResults;
        displayResults(deduplicatedResults);
    } catch (error) {
        console.error('Error aggregating results:', error);
        showError('Failed to fetch results. Please try again.');
    } finally {
        showLoading(false);
    }
}

function deduplicateResults(results) {
    const seen = new Map();
    return results.filter(paper => {
        if (paper.doi && seen.has(paper.doi)) return false;
        const normalizedTitle = normalizeTitle(paper.title);
        for (const [key, value] of seen.entries()) {
            if (titleSimilarity(normalizedTitle, value) > 0.85) return false;
        }
        if (paper.doi) seen.set(paper.doi, normalizedTitle);
        else seen.set(paper.id, normalizedTitle);
        return true;
    });
}

function normalizeTitle(title) {
    return title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function titleSimilarity(title1, title2) {
    const words1 = new Set(title1.split(' '));
    const words2 = new Set(title2.split(' '));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
}

function generateId() {
    return `paper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// CACHING
// ============================================

function getCachedResults(query) {
    try {
        const cache = localStorage.getItem('resultsCache');
        if (!cache) return null;
        const parsed = JSON.parse(cache);
        const cached = parsed[query];
        if (!cached) return null;
        if (Date.now() - cached.timestamp > 3600000) return null;
        return cached.results;
    } catch (error) {
        return null;
    }
}

function cacheResults(query, results) {
    try {
        const cache = localStorage.getItem('resultsCache');
        const parsed = cache ? JSON.parse(cache) : {};
        parsed[query] = { results, timestamp: Date.now() };
        const keys = Object.keys(parsed);
        if (keys.length > 10) {
            const oldest = keys.reduce((a, b) => parsed[a].timestamp < parsed[b].timestamp ? a : b);
            delete parsed[oldest];
        }
        localStorage.setItem('resultsCache', JSON.stringify(parsed));
    } catch (error) {
        console.error('Cache write error:', error);
    }
}

// ============================================
// FILTERING & SORTING
// ============================================

function applyFilters(results) {
    return results.filter(paper => {
        if (currentFilters.yearMin && paper.year < currentFilters.yearMin) return false;
        if (currentFilters.yearMax && paper.year > currentFilters.yearMax) return false;
        if (currentFilters.minCitations && paper.citations < currentFilters.minCitations) return false;
        if (currentFilters.openAccessOnly && !paper.isOpenAccess) return false;
        if (currentFilters.source !== 'all' && paper.source !== currentFilters.source) return false;
        return true;
    });
}

function sortResults(results) {
    const sorted = [...results];
    switch (currentSort) {
        case 'citations': sorted.sort((a, b) => b.citations - a.citations); break;
        case 'year': sorted.sort((a, b) => (b.year || 0) - (a.year || 0)); break;
        case 'relevance': default: break;
    }
    return sorted;
}

// ============================================
// UI RENDERING
// ============================================

function displayResults(results) {
    const filtered = applyFilters(results);
    const sorted = sortResults(filtered);
    resultsCount.textContent = sorted.length;
    resultsSection.classList.remove('hidden');
    resultsContainer.innerHTML = '';
    if (sorted.length === 0) {
        resultsContainer.innerHTML = `
            <div class="text-center py-12 bg-gold-400/[0.08] rounded-2xl border-2 border-dashed border-gold-400/20">
                <div class="text-6xl mb-4 opacity-50">🔍</div>
                <h3 class="text-2xl font-bold text-white mb-2">No results found</h3>
                <p class="text-gold-200/80 text-lg">Try adjusting your filters or search query</p>
            </div>
        `;
        return;
    }
    sorted.forEach((paper, index) => {
        const card = createPaperCard(paper, index);
        resultsContainer.appendChild(card);
    });
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function createPaperCard(paper, index) {
    const card = document.createElement('div');
    card.className = 'paper-card bg-gold-400/[0.08] backdrop-blur-xl border-2 border-gold-400/15 rounded-2xl p-6 transition-all duration-300 hover:border-gold-400/40 hover:shadow-gold hover:translate-x-1 opacity-0 animate-fade-in-up';
    card.style.animationDelay = `${index * 50}ms`;
    const authorsShort = truncateText(paper.authors, 100);
    const abstractShort = truncateText(paper.abstract, 300);
    const isSelected = selectedSources.some(s => s.id === paper.id);

    card.innerHTML = `
        <div class="mb-4">
            <h3 class="text-xl font-bold mb-2 leading-tight">
                <a href="${paper.url}" target="_blank" rel="noopener noreferrer" class="text-white no-underline transition-colors duration-150 hover:text-gold-400">${paper.title}</a>
            </h3>
            <div class="flex flex-wrap gap-2 mt-2">
                ${paper.isOpenAccess ? '<span class="inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Open Access</span>' : ''}
                ${paper.year ? `<span class="inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-gold-400/15 text-gold-200 border border-gold-400/30">${paper.year}</span>` : ''}
                <span class="inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">${paper.source}</span>
            </div>
        </div>
        <div class="text-gold-200/80 text-sm mb-2 italic">${authorsShort}</div>
        <div class="text-gold-200/80 text-base leading-relaxed mb-4">${abstractShort}</div>
        <div class="flex flex-wrap gap-4 mb-4 pt-4 border-t border-gold-400/10">
            <div class="flex items-center gap-2 text-gold-200/80 text-sm"><span>📄</span><span>${paper.venue}</span></div>
            <div class="flex items-center gap-2 text-gold-200/80 text-sm"><span>📊</span><span>${paper.citations} citations</span></div>
        </div>
        <div class="flex flex-wrap gap-3">
            ${paper.pdfUrl ? `<a href="${paper.pdfUrl}" target="_blank" class="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-gold-400 via-gold-200 to-gold-400 text-navy-900 border border-gold-400/30 transition-all duration-300 hover:shadow-gold no-underline">📥 PDF</a>` : ''}
            <button class="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-xl bg-navy-700 text-white border border-gold-400/20 transition-all duration-300 hover:bg-navy-800 hover:border-gold-400 hover:shadow-[0_0_15px_rgba(212,175,55,0.2)] cursor-pointer" onclick="window.AcademicSourceFinder.addToSources('${escapeHtml(paper.id)}')">
                ${isSelected ? '✅ Added' : '➕ Add to Essay'}
            </button>
            <button class="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-xl bg-navy-700 text-white border border-gold-400/20 transition-all duration-300 hover:bg-navy-800 hover:border-gold-400 hover:shadow-[0_0_15px_rgba(212,175,55,0.2)] cursor-pointer" onclick="window.AcademicSourceFinder.copyBibTeX('${escapeHtml(paper.id)}')">📋 Cite</button>
        </div>
    `;
    return card;
}

function truncateText(text, maxLength) {
    if (!text) return 'N/A';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(show) {
    if (show) {
        loadingIndicator.classList.remove('hidden');
        resultsContainer.innerHTML = createLoadingSkeletons();
    } else {
        loadingIndicator.classList.add('hidden');
    }
}

function createLoadingSkeletons() {
    return Array(5).fill(0).map(() => `
        <div class="bg-gold-400/[0.08] backdrop-blur-xl border-2 border-gold-400/15 rounded-2xl p-6 pointer-events-none opacity-70">
            <div class="h-8 w-4/5 bg-gradient-to-r from-gold-400/10 via-gold-400/20 to-gold-400/10 rounded-lg mb-3 animate-pulse"></div>
            <div class="h-4 w-full bg-gradient-to-r from-gold-400/10 via-gold-400/20 to-gold-400/10 rounded-lg mb-3 animate-pulse"></div>
            <div class="h-4 w-full bg-gradient-to-r from-gold-400/10 via-gold-400/20 to-gold-400/10 rounded-lg mb-3 animate-pulse"></div>
            <div class="h-4 w-3/5 bg-gradient-to-r from-gold-400/10 via-gold-400/20 to-gold-400/10 rounded-lg animate-pulse"></div>
        </div>
    `).join('');
}

function showError(message) {
    resultsContainer.innerHTML = `
        <div class="text-center py-12 bg-red-500/10 rounded-2xl border-2 border-red-500/30">
            <div class="text-6xl mb-4">⚠️</div>
            <h3 class="text-2xl font-bold text-red-400 mb-2">Error</h3>
            <p class="text-gold-200/80 text-lg">${message}</p>
        </div>
    `;
    resultsSection.classList.remove('hidden');
}

// ============================================
// SOURCE MANAGEMENT
// ============================================

function addToSources(paperId) {
    const paper = currentResults.find(p => p.id === paperId);
    if (!paper) return;

    if (!selectedSources.some(s => s.id === paper.id)) {
        selectedSources.push(paper);
        saveSourcestoStorage();
        updateSourcesUI();
        showToast('Added to sources!');
        
        // Track source addition analytics
        if (window.Analytics) {
            window.Analytics.trackEvent('source_added', { source: paper.source || 'unknown' });
        }

        const btn = document.querySelector(`button[onclick*="${paperId}"]`);
        if (btn && btn.textContent.includes('Add')) {
            btn.textContent = '✅ Added';
        }
    } else {
        showToast('Already in sources');
    }
}

function removeFromSources(index) {
    selectedSources.splice(index, 1);
    saveSourcestoStorage();
    updateSourcesUI();
    displayResults(currentResults);
}

function updateSourcesUI() {
    const count = selectedSources.length;
    floatingSourceCount.textContent = count;
    writerSourceCount.textContent = count;

    if (count > 0) {
        floatingSourceCount.classList.remove('hidden');
    } else {
        floatingSourceCount.classList.add('hidden');
    }

    const listHtml = selectedSources.map((source, index) => `
        <div class="flex justify-between items-center py-2 px-1 border-b border-white/5 last:border-b-0 text-sm text-gold-200/80">
            <span>${truncateText(source.title, 40)} (${source.year || 'n.d.'})</span>
            <button class="bg-transparent border-none text-red-400 cursor-pointer text-xl px-2 hover:opacity-70 transition-opacity" onclick="window.AcademicSourceFinder.removeFromSources(${index})">×</button>
        </div>
    `).join('');

    const emptyHtml = '<p class="text-gray-500 text-sm">No sources selected.</p>';

    panelSourcesList.innerHTML = count ? listHtml : emptyHtml;
    writerSourcesList.innerHTML = count ? listHtml : '<p class="text-gray-500 text-sm">No sources selected yet. Go to Search to add sources.</p>';
}

function addManualSource() {
    const title = document.getElementById('manualTitle').value.trim();
    const author = document.getElementById('manualAuthor').value.trim();
    const year = document.getElementById('manualYear').value.trim();

    if (!title) {
        alert('Title is required');
        return;
    }

    const newSource = {
        id: generateId(),
        title,
        authors: author || 'Unknown',
        year: year || null,
        source: 'Manual Entry',
        isManual: true
    };

    selectedSources.push(newSource);
    saveSourcestoStorage();
    updateSourcesUI();
    closeModal();
    showToast('Manual source added');

    document.getElementById('manualTitle').value = '';
    document.getElementById('manualAuthor').value = '';
    document.getElementById('manualYear').value = '';
}

// ============================================
// CITATION EXPORT
// ============================================

function copyBibTeX(paperId) {
    const paper = currentResults.find(p => p.id === paperId);
    if (!paper) return;
    const bibtex = generateBibTeX(paper);
    navigator.clipboard.writeText(bibtex).then(() => showToast('Citation copied!')).catch(err => showToast('Failed to copy'));
}

function generateBibTeX(paper) {
    const id = paper.id.replace(/[^a-zA-Z0-9]/g, '');
    const authors = paper.authors.split(', ').join(' and ');
    return `@article{${id},\n  title={${paper.title}},\n  author={${authors}},\n  journal={${paper.venue}},\n  year={${paper.year || 'n.d.'}},\n  url={${paper.url}}\n}`;
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-8 right-8 bg-navy-800 text-white px-6 py-4 rounded-2xl border-2 border-gold-400 shadow-gold font-semibold opacity-0 translate-y-24 transition-all duration-300 z-[1000]';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('opacity-0', 'translate-y-24');
        toast.classList.add('opacity-100', 'translate-y-0');
    }, 100);
    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-24');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// EVENT HANDLERS & NAVIGATION
// ============================================

function switchTab(tabId) {
    navTabs.forEach(tab => {
        if (tab.dataset.tab === tabId) {
            tab.classList.add('active', 'text-gold-400');
            tab.classList.remove('text-gold-200/60');
        } else {
            tab.classList.remove('active', 'text-gold-400');
            tab.classList.add('text-gold-200/60');
        }
    });

    viewSections.forEach(section => {
        if (section.id === `${tabId}-view`) section.classList.add('active');
        else section.classList.remove('active');
    });
}

function toggleSourcesPanel() {
    sourcesPanel.classList.toggle('open');
}

function openModal() {
    manualSourceModal.classList.remove('hidden');
}

function closeModal() {
    manualSourceModal.classList.add('hidden');
}

function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
        alert('Please enter a search query');
        searchInput.focus();
        return;
    }
    // Track search analytics
    if (window.Analytics) {
        window.Analytics.trackEvent('search', { query: query.substring(0, 50) });
    }
    aggregateResults(query);
}

function handleSortChange(e) {
    currentSort = e.target.value;
    displayResults(currentResults);
}

// ============================================
// INITIALIZATION
// ============================================

function init() {
    // Search Events
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
    if (sortSelect) sortSelect.addEventListener('change', handleSortChange);

    // Navigation Events
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Sources Panel Events
    sourcesToggleBtn.addEventListener('click', toggleSourcesPanel);
    closePanelBtn.addEventListener('click', toggleSourcesPanel);
    goToWriterBtn.addEventListener('click', () => {
        toggleSourcesPanel();
        switchTab('writer');
    });

    // Writer Events
    generateDraftBtn.addEventListener('click', generateDraft);
    stopGenerationBtn.addEventListener('click', stopGeneration);
    addManualSourceBtn.addEventListener('click', openModal);

    // AI Config Events
    if (toggleApiKey) toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
    if (aiProvider) aiProvider.addEventListener('change', loadApiKey);
    if (apiKeyInput) apiKeyInput.addEventListener('blur', saveApiKey);
    
    // Demo AI Key button
    const useDemoAiKeyBtn = document.getElementById('useDemoAiKeyBtn');
    if (useDemoAiKeyBtn) useDemoAiKeyBtn.addEventListener('click', useDemoAiKey);

    // Load saved API key and sources
    loadApiKey();
    loadSourcesFromStorage();

    // Modal Events
    saveManualSourceBtn.addEventListener('click', addManualSource);
    cancelManualSourceBtn.addEventListener('click', closeModal);
    manualSourceModal.addEventListener('click', (e) => {
        if (e.target === manualSourceModal) closeModal();
    });

    // Copy Draft
    copyDraftBtn.addEventListener('click', () => {
        const text = draftOutput.innerText;
        navigator.clipboard.writeText(text).then(() => showToast('Draft copied!'));
    });

    // Refine/Humanize Essay
    const refineEssayBtn = document.getElementById('refineEssayBtn');
    if (refineEssayBtn) {
        refineEssayBtn.addEventListener('click', refineEssay);
    }

    // Download Draft
    if (downloadDraftBtn) {
        downloadDraftBtn.addEventListener('click', () => {
            const text = draftOutput.innerText;
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'essay-draft.txt';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Draft downloaded!');
        });
    }

    // Initialize Analyzer
    initAnalyzer();
    
    // Initialize Summarizer
    initSummarizer();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);

// ============================================
// AI DETECTION HUB - Multi-API Integration
// ============================================

const analyzerInput = document.getElementById('analyzerInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearAnalyzerBtn = document.getElementById('clearAnalyzerBtn');
const analysisResults = document.getElementById('analysisResults');
const loadFromWriterBtn = document.getElementById('loadFromWriterBtn');
const detectorLinks = document.querySelectorAll('.detector-link');

// Detector configurations
const DETECTORS = {
    zerogpt: {
        name: 'ZeroGPT',
        icon: '🎯',
        hasApi: true,
        requiresKey: false,
        endpoint: 'https://api.zerogpt.com/api/detect/detectText'
    },
    gptzero: {
        name: 'GPTZero',
        icon: '🤖',
        hasApi: true,
        requiresKey: true,
        endpoint: 'https://api.gptzero.me/v2/predict/text'
    },
    sapling: {
        name: 'Sapling AI',
        icon: '🌱',
        hasApi: true,
        requiresKey: true,
        endpoint: 'https://api.sapling.ai/api/v1/aidetect'
    }
};

// Demo keys are obfuscated - not secure, but prevents casual scraping
// IMPORTANT: Replace these with your actual base64-encoded keys
const DEMO_KEYS_ENCODED = {
    // To encode your keys: btoa('your-api-key-here')
    // To decode: atob(encoded)
    // AI Providers
    gemini: 'QUl6YVN5QWJicVc0d1BKYXhnRmNhb0UzM1FvVEloMmpDVTRpZmRV', // Add your base64-encoded Gemini key
    // Detectors
    zerogpt: 'ZDBlODZkMWUtYmY4Ni00YjM2LWI1NzctZTZjYTc0NGFmZTdh',
    gptzero: '',
    sapling: 'WTRISFpBVDRVVEcxWFpUMFpSNzJCVEJZTU5WU1RaT0w'
};

// Track if using demo keys (to mask them)
let usingDemoAiKey = false;
let usingDemoDetectorKeys = false;

// AI Provider Demo Key
function useDemoAiKey() {
    const provider = aiProvider?.value || 'gemini';
    let demoKey = '';
    
    // Only Gemini has demo key for now
    if (provider === 'gemini' || provider === 'gemini-pro') {
        try {
            demoKey = DEMO_KEYS_ENCODED.gemini ? atob(DEMO_KEYS_ENCODED.gemini) : '';
        } catch (e) {
            demoKey = '';
        }
    }
    
    if (!demoKey) {
        showToast(`No demo key for ${AI_PROVIDERS[provider]?.name || provider}. Get your free key!`);
        return;
    }
    
    if (apiKeyInput) {
        apiKeyInput.value = demoKey;
        apiKeyInput.type = 'password'; // Keep hidden
        usingDemoAiKey = true;
        saveApiKey();
        // Mark as demo in storage
        localStorage.setItem(`apiKey_${provider}_isDemo`, 'true');
        showToast('Demo key loaded! ⚠️ May have rate limits');
    }
}

// Detector API Keys Management

function getDemoKey(service) {
    try {
        const encoded = DEMO_KEYS_ENCODED[service];
        if (!encoded) return '';
        // Simple decode
        return atob(encoded);
    } catch (e) {
        return '';
    }
}

function useDemoKeys() {
    const zerogptKey = getDemoKey('zerogpt');
    const gptzeroKey = getDemoKey('gptzero');
    const saplingKey = getDemoKey('sapling');
    
    if (!zerogptKey && !gptzeroKey && !saplingKey) {
        showToast('Demo keys not configured yet');
        return;
    }
    
    // Set keys with masked display
    const setMaskedKey = (id, key) => {
        const input = document.getElementById(id);
        if (input && key) {
            input.value = key;
            input.type = 'password';
        }
    };
    
    setMaskedKey('zerogptKey', zerogptKey);
    setMaskedKey('gptzeroKey', gptzeroKey);
    setMaskedKey('saplingKey', saplingKey);
    
    // Auto-save and mark as demo
    usingDemoDetectorKeys = true;
    saveDetectorKeys();
    localStorage.setItem('detectorKeys_isDemo', 'true');
    showToast('Demo keys loaded! ⚠️ May have rate limits');
}

function clearDetectorKeys() {
    localStorage.removeItem('detectorApiKeys');
    localStorage.removeItem('detectorKeys_isDemo');
    usingDemoDetectorKeys = false;
    if (document.getElementById('zerogptKey')) document.getElementById('zerogptKey').value = '';
    if (document.getElementById('gptzeroKey')) document.getElementById('gptzeroKey').value = '';
    if (document.getElementById('saplingKey')) document.getElementById('saplingKey').value = '';
    showToast('Keys cleared');
}

function saveDetectorKeys() {
    const keys = {
        zerogpt: document.getElementById('zerogptKey')?.value || '',
        gptzero: document.getElementById('gptzeroKey')?.value || '',
        sapling: document.getElementById('saplingKey')?.value || ''
    };
    localStorage.setItem('detectorApiKeys', JSON.stringify(keys));
    showToast('API keys saved!');
}

function loadDetectorKeys() {
    try {
        const saved = localStorage.getItem('detectorApiKeys');
        if (saved) {
            const keys = JSON.parse(saved);
            if (document.getElementById('zerogptKey')) document.getElementById('zerogptKey').value = keys.zerogpt || '';
            if (document.getElementById('gptzeroKey')) document.getElementById('gptzeroKey').value = keys.gptzero || '';
            if (document.getElementById('saplingKey')) document.getElementById('saplingKey').value = keys.sapling || '';
        }
    } catch (e) {
        console.error('Failed to load detector keys:', e);
    }
}

function getDetectorKey(name) {
    try {
        const saved = localStorage.getItem('detectorApiKeys');
        if (saved) {
            const keys = JSON.parse(saved);
            return keys[name] || '';
        }
    } catch (e) {}
    return '';
}

let isAnalyzing = false;

// ============================================
// API DETECTION FUNCTIONS
// ============================================

async function detectWithZeroGPT(text, apiKey) {
    if (!apiKey) {
        return { detector: 'zerogpt', error: 'No API key', skipped: true };
    }
    
    const apiUrl = 'https://api.zerogpt.com/api/detect/detectText';
    
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'ApiKey': apiKey
            },
            body: JSON.stringify({ input_text: text })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return parseZeroGPTResponse(data);
        
    } catch (error) {
        console.error('ZeroGPT error:', error);
        // If direct fails, try with CORS proxy
        try {
            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(apiUrl);
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'ApiKey': apiKey
                },
                body: JSON.stringify({ input_text: text })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            return parseZeroGPTResponse(data);
        } catch (proxyError) {
            return { 
                detector: 'zerogpt', 
                error: error.message || 'API failed',
                corsBlocked: true
            };
        }
    }
}

function parseZeroGPTResponse(data) {
    // Handle both success formats
    if (data.success === false) {
        throw new Error(data.message || 'Detection failed');
    }
    
    // Extract AI percentage - ZeroGPT returns fakePercentage
    const aiScore = Math.round(data.data?.fakePercentage ?? data.fakePercentage ?? 0);
    const isHuman = data.data?.isHuman ?? data.isHuman ?? (aiScore < 50);
    
    return {
        detector: 'zerogpt',
        name: 'ZeroGPT',
        icon: '🎯',
        aiScore: aiScore,
        humanScore: 100 - aiScore,
        verdict: isHuman ? 'Human' : aiScore > 70 ? 'AI' : 'Mixed',
        details: {
            textWords: data.data?.textWords ?? data.textWords,
            aiWords: data.data?.aiWords ?? data.aiWords,
            feedback: data.data?.feedback ?? data.feedback,
            sentences: data.data?.sentences ?? data.sentences
        }
    };
}

// GPTZero API - Free tier available at https://gptzero.me/docs
async function detectWithGPTZero(text, apiKey) {
    if (!apiKey) {
        return { detector: 'gptzero', error: 'No API key', skipped: true };
    }
    
    try {
        const response = await fetch('https://api.gptzero.me/v2/predict/text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({ document: text })
        });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const aiProb = data.documents?.[0]?.completely_generated_prob || 0;
        const aiScore = Math.round(aiProb * 100);
        
        return {
            detector: 'gptzero',
            name: 'GPTZero',
            icon: '🤖',
            aiScore: aiScore,
            humanScore: 100 - aiScore,
            verdict: aiProb > 0.5 ? 'AI' : aiProb > 0.3 ? 'Mixed' : 'Human',
            details: {
                avgGeneratedProb: data.documents?.[0]?.average_generated_prob,
                sentences: data.documents?.[0]?.sentences?.length || 0,
                perplexity: data.documents?.[0]?.overall_burstiness
            }
        };
    } catch (error) {
        return { detector: 'gptzero', error: error.message };
    }
}

// Sapling AI API - Free tier available at https://sapling.ai/user/apikeys  
async function detectWithSapling(text, apiKey) {
    if (!apiKey) {
        return { detector: 'sapling', error: 'No API key', skipped: true };
    }
    
    try {
        const response = await fetch('https://api.sapling.ai/api/v1/aidetect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                key: apiKey, 
                text: text 
            })
        });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.msg || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const aiScore = Math.round((data.score || 0) * 100);
        
        return {
            detector: 'sapling',
            name: 'Sapling AI',
            icon: '🌱',
            aiScore: aiScore,
            humanScore: 100 - aiScore,
            verdict: aiScore > 50 ? 'AI' : aiScore > 30 ? 'Mixed' : 'Human',
            details: {
                confidence: data.score,
                sentenceScores: data.sentence_scores?.length || 0
            }
        };
    } catch (error) {
        return { detector: 'sapling', error: error.message };
    }
}

// ============================================
// ENHANCED LOCAL AI DETECTION (Free Forever!)
// Based on research from linguistic analysis of LLM outputs
// ============================================

// ============================================
// ADVANCED AI DETECTION ENGINE
// Based on GPTZero/ZeroGPT methodology:
// - Perplexity (text predictability)
// - Burstiness (sentence variation)
// - Statistical analysis
// ============================================

const AI_DETECTION_CONFIG = {
    // High-confidence AI phrases (extremely common in LLM output)
    highConfidencePhrases: [
        'it is important to note', 'it is worth noting', 'it should be noted',
        'it is essential to', 'it is crucial to', 'it is vital to',
        'in today\'s world', 'in the modern era', 'in contemporary society',
        'plays a crucial role', 'plays an important role', 'plays a significant role',
        'delve into', 'dive deep into', 'explore the intricacies',
        'comprehensive overview', 'holistic approach', 'nuanced understanding',
        'a testament to', 'serves as a reminder', 'stands as a beacon',
        'the realm of', 'navigating the', 'in the landscape of',
        'it\'s worth mentioning', 'it bears mentioning', 'one cannot overstate',
        'at the heart of', 'the crux of the matter', 'sheds light on',
        'pave the way', 'the cornerstone of', 'a myriad of',
        'foster a sense of', 'cultivate an environment', 'harness the power'
    ],
    
    // Medium-confidence transitions (AI overuses formal transitions)
    formalTransitions: [
        'furthermore', 'moreover', 'additionally', 'consequently', 'nevertheless',
        'henceforth', 'thereby', 'whereby', 'wherein', 'therein',
        'notwithstanding', 'nonetheless', 'in lieu of', 'vis-à-vis',
        'in light of this', 'with this in mind', 'given this context',
        'it follows that', 'by extension', 'in tandem with'
    ],
    
    // AI-favorite "sophisticated" words
    aiVocabulary: [
        'multifaceted', 'paramount', 'myriad', 'plethora', 'pivotal',
        'intricate', 'nuanced', 'comprehensive', 'robust', 'seamless',
        'innovative', 'transformative', 'groundbreaking', 'cutting-edge',
        'meticulous', 'rigorous', 'holistic', 'synergy', 'synergistic',
        'leverage', 'utilize', 'facilitate', 'optimize', 'streamline',
        'paradigm', 'ecosystem', 'landscape', 'framework', 'methodology',
        'imperative', 'indispensable', 'instrumental', 'quintessential',
        'ubiquitous', 'unprecedented', 'unparalleled', 'undeniable'
    ],
    
    // Common English words (used for perplexity calculation)
    commonWords: new Set([
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
        'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
        'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
        'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
        'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
        'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
        'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
        'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
        'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
        'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
        'is', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'does', 'did',
        'very', 'more', 'many', 'much', 'such', 'each', 'every', 'both', 'few', 'most'
    ]),
    
    // Human writing indicators
    humanIndicators: [
        /\b(I think|I believe|I feel|in my opinion|personally|honestly|frankly|actually)\b/i,
        /\b(don't|won't|can't|isn't|aren't|wasn't|weren't|hasn't|haven't|couldn't|wouldn't|shouldn't)\b/,
        /\b(kinda|gonna|wanna|gotta|yeah|nope|yep|okay|ok|alright)\b/i,
        /\b(pretty|really|very|quite|rather|somewhat|a bit|kind of|sort of)\b/i,
        /[!?]{2,}/, // Multiple punctuation
        /\b(well,|so,|anyway,|basically,|honestly,|actually,)\b/i,
        /—/, // Em dash
        /\.{3}/, // Ellipsis
        /\b(weird|cool|awesome|crazy|funny|interesting|boring)\b/i,
        /\?$/, // Questions (AI underuses these)
        /!$/, // Exclamations
        /\([^)]+\)/, // Parenthetical asides
    ]
};

function analyzePatterns(text) {
    // ============================================
    // SIMPLIFIED AI DETECTION - Focus on what works
    // ============================================
    
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
    const lowerText = text.toLowerCase();
    const cleanWords = words.map(w => w.toLowerCase().replace(/[^a-z']/g, '')).filter(w => w.length > 1);
    
    if (words.length < 50) {
        return {
            detector: 'patterns',
            name: 'Local Analysis',
            icon: '🔬',
            aiScore: 50,
            humanScore: 50,
            verdict: 'Need more text (50+ words)',
            error: 'Text too short for accurate analysis'
        };
    }
    
    let aiScore = 0;
    const foundPhrases = [];
    const foundAiVocab = [];
    
    // ============================================
    // 1. AI PHRASE DETECTION (Most reliable indicator!)
    // Each phrase found = strong AI signal
    // ============================================
    
    let phraseCount = 0;
    AI_DETECTION_CONFIG.highConfidencePhrases.forEach(phrase => {
        if (lowerText.includes(phrase)) {
            phraseCount++;
            foundPhrases.push({ phrase, severity: 'high' });
        }
    });
    
    // High confidence phrases: +6 each (max 42)
    const phraseScore = Math.min(42, phraseCount * 6);
    aiScore += phraseScore;
    
    // ============================================
    // 2. FORMAL TRANSITIONS (AI overuses these)
    // ============================================
    
    let transitionCount = 0;
    AI_DETECTION_CONFIG.formalTransitions.forEach(word => {
        const regex = new RegExp('\\b' + word + '\\b', 'gi');
        const matches = lowerText.match(regex);
        if (matches) {
            transitionCount += matches.length;
            if (foundPhrases.length < 12) {
                foundPhrases.push({ phrase: word, severity: 'medium' });
            }
        }
    });
    
    // Transitions: +2 each (max 16)
    const transitionScore = Math.min(16, transitionCount * 2);
    aiScore += transitionScore;
    
    // ============================================
    // 3. AI VOCABULARY (Sophisticated words AI loves)
    // ============================================
    
    let vocabCount = 0;
    AI_DETECTION_CONFIG.aiVocabulary.forEach(word => {
        const regex = new RegExp('\\b' + word + '\\b', 'gi');
        const matches = text.match(regex);
        if (matches) {
            vocabCount += matches.length;
            foundAiVocab.push(`${word} (${matches.length}x)`);
        }
    });
    
    // AI vocab: +1.5 each (max 15)
    const vocabScore = Math.min(15, Math.round(vocabCount * 1.5));
    aiScore += vocabScore;
    
    // ============================================
    // 4. SENTENCE UNIFORMITY (AI = uniform, Human = varied)
    // ============================================
    
    const sentenceLengths = sentences.map(s => s.split(/\s+/).filter(w => w).length);
    const avgLen = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length || 15;
    const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) / sentenceLengths.length;
    const stdDev = Math.sqrt(variance);
    
    // Low variation = AI-like (+15 if very uniform)
    let uniformityScore = 0;
    if (stdDev < 4) uniformityScore = 15;
    else if (stdDev < 6) uniformityScore = 10;
    else if (stdDev < 8) uniformityScore = 5;
    aiScore += uniformityScore;
    
    // ============================================
    // 5. PARAGRAPH UNIFORMITY
    // ============================================
    
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    let paraUniformityScore = 0;
    if (paragraphs.length >= 3) {
        const paraLengths = paragraphs.map(p => p.split(/\s+/).length);
        const paraAvg = paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length;
        const paraStdDev = Math.sqrt(paraLengths.reduce((sum, len) => sum + Math.pow(len - paraAvg, 2), 0) / paraLengths.length);
        const paraCV = paraAvg > 0 ? paraStdDev / paraAvg : 0;
        
        // Very uniform paragraphs = AI-like
        if (paraCV < 0.2) paraUniformityScore = 8;
        else if (paraCV < 0.35) paraUniformityScore = 4;
    }
    aiScore += paraUniformityScore;
    
    // ============================================
    // 6. AI SENTENCE STARTERS
    // ============================================
    
    const aiStarters = [
        /^This (is|was|has|demonstrates|shows|highlights|indicates|suggests|illustrates|reveals|represents|provides)/i,
        /^It (is|was|has been|should be|can be|must be) (important|essential|crucial|vital|worth|clear|evident|noted|mentioned)/i,
        /^(Furthermore|Moreover|Additionally|Consequently|Nevertheless|However|Therefore|Thus|Hence),?\s/i,
        /^In (conclusion|summary|addition|contrast|order to|light of|terms of|the context of|this regard)/i,
        /^The (importance|significance|role|impact|concept|notion|idea|purpose|goal|aim) of/i,
        /^(One|Another|A key|An important|A significant|A crucial) (aspect|factor|element|point|consideration)/i,
        /^There (is|are|has been|have been|exists?) (a|an|no|some|many|several|numerous|significant|growing)/i,
        /^(Overall|Ultimately|Essentially|Fundamentally|Basically),?\s/i
    ];
    
    let starterCount = 0;
    sentences.forEach(s => {
        const trimmed = s.trim();
        aiStarters.forEach(pattern => {
            if (pattern.test(trimmed)) starterCount++;
        });
    });
    
    const starterRatio = sentences.length > 0 ? starterCount / sentences.length : 0;
    const starterScore = Math.min(12, Math.round(starterRatio * 40));
    aiScore += starterScore;
    
    // ============================================
    // 7. HUMAN INDICATORS (Subtract from AI score!)
    // ============================================
    
    let humanBonus = 0;
    
    // Contractions (very human!)
    const contractions = (text.match(/\b(don't|won't|can't|isn't|aren't|wasn't|weren't|hasn't|haven't|couldn't|wouldn't|shouldn't|didn't|doesn't|I'm|I've|I'll|I'd|we're|we've|we'll|they're|they've|you're|you've|it's|that's|there's|here's|what's|who's|let's)\b/gi) || []).length;
    humanBonus += Math.min(12, contractions * 2);
    
    // Questions (AI rarely asks questions)
    const questions = (text.match(/\?/g) || []).length;
    humanBonus += Math.min(8, questions * 3);
    
    // Exclamations
    const exclamations = (text.match(/!/g) || []).length;
    humanBonus += Math.min(5, exclamations * 2);
    
    // Personal pronouns and opinions
    const personal = (text.match(/\b(I think|I believe|I feel|in my opinion|personally|honestly|frankly|actually|basically|literally)\b/gi) || []).length;
    humanBonus += Math.min(10, personal * 3);
    
    // Casual language
    const casual = (text.match(/\b(pretty|really|very|quite|kind of|sort of|a bit|stuff|things|gonna|wanna|gotta|yeah|ok|okay|cool|awesome|great|nice|bad|good)\b/gi) || []).length;
    humanBonus += Math.min(8, casual * 1.5);
    
    // Em dashes, ellipses (human style)
    const stylistic = (text.match(/—|\.{3}|–/g) || []).length;
    humanBonus += Math.min(5, stylistic * 2);
    
    // Parenthetical asides
    const parentheticals = (text.match(/\([^)]+\)/g) || []).length;
    humanBonus += Math.min(4, parentheticals * 2);
    
    // Apply human bonus
    aiScore = Math.max(0, aiScore - humanBonus);
    
    // ============================================
    // FINAL SCORE
    // ============================================
    
    // Cap at 100
    aiScore = Math.min(100, Math.round(aiScore));
    const humanScore = 100 - aiScore;
    
    // Verdict
    let verdict;
    if (aiScore >= 70) verdict = 'Highly Likely AI';
    else if (aiScore >= 50) verdict = 'Likely AI';
    else if (aiScore >= 35) verdict = 'Mixed / Uncertain';
    else if (aiScore >= 15) verdict = 'Likely Human';
    else verdict = 'Highly Likely Human';
    
    return {
        detector: 'patterns',
        name: 'Local Analysis',
        icon: '🔬',
        aiScore,
        humanScore,
        verdict,
        stats: {
            wordCount: words.length,
            sentenceCount: sentences.length,
            paragraphCount: paragraphs.length,
            avgSentenceLength: avgLen.toFixed(1),
            vocabularyDiversity: ((new Set(cleanWords).size / cleanWords.length) * 100).toFixed(1) + '%',
            sentenceVariation: stdDev.toFixed(1)
        },
        breakdown: {
            phraseScore,
            transitionScore,
            vocabScore,
            uniformityScore,
            starterScore,
            humanBonus: Math.round(humanBonus)
        },
        issues: {
            aiPhrases: foundPhrases.slice(0, 8),
            aiVocabulary: foundAiVocab.slice(0, 6),
            phraseCount: phraseCount + transitionCount
        },
        suggestions: generateAdvancedSuggestions(aiScore, foundPhrases, foundAiVocab, uniformityScore, humanBonus)
    };
}

function generateAdvancedSuggestions(aiScore, foundPhrases, foundAiVocab, burstiScore, humanCount) {
    const suggestions = [];
    
    if (aiScore < 30) {
        suggestions.push('✅ Your text shows strong human writing characteristics!');
        return suggestions;
    }
    
    // Priority suggestions based on what's detected
    const highPhrases = foundPhrases.filter(p => p.severity === 'high');
    if (highPhrases.length > 0) {
        suggestions.push(`🔴 Remove AI phrases: "${highPhrases.slice(0, 2).map(p => p.phrase).join('", "')}"`);
    }
    
    if (burstiScore > 15) {
        suggestions.push('📏 Vary your sentence lengths more - mix short punchy sentences with longer ones');
    }
    
    if (foundAiVocab.length > 3) {
        suggestions.push(`📝 Replace formal words like "${foundAiVocab.slice(0, 2).join('", "').replace(/ \(\d+x\)/g, '')}"`);
    }
    
    if (humanCount < 3) {
        suggestions.push('💬 Add personal touches: contractions (don\'t, isn\'t), questions, or opinions');
    }
    
    if (suggestions.length === 0 && aiScore > 40) {
        suggestions.push('🔄 Try rewriting some sentences in a more casual, conversational tone');
    }
    
    return suggestions.slice(0, 4);
}

// Keep old function name for compatibility
function generatePatternSuggestions(aiScore, foundPhrases, foundOverused, diversity, stdDev, humanPatterns) {
    return generateAdvancedSuggestions(aiScore, foundPhrases, foundOverused, stdDev, humanPatterns);
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

async function runAllDetectors() {
    const text = analyzerInput.value.trim();
    
    if (!text) {
        showToast('Please enter some text to analyze');
        return;
    }
    
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 50) {
        showToast('Please enter at least 50 words for accurate detection');
        return;
    }
    
    if (isAnalyzing) return;
    isAnalyzing = true;
    
    // Track AI detection analytics
    if (window.Analytics) {
        window.Analytics.trackEvent('ai_detection', { wordCount: wordCount });
    }
    
    // Update UI
    analyzeBtn.disabled = true;
    document.getElementById('analyzeBtnIcon').textContent = '⏳';
    document.getElementById('analyzeBtnText').textContent = 'Analyzing...';
    
    // Show loading state
    analysisResults.innerHTML = `
        <div class="space-y-4">
            <div class="text-center py-8">
                <div class="text-4xl mb-4 animate-pulse">🔬</div>
                <h3 class="text-lg font-bold text-gold-400 mb-2">Running AI Detectors...</h3>
                <p class="text-sm text-gold-200/60">Checking with multiple services</p>
            </div>
            <div id="detectorProgress" class="space-y-2">
                ${Object.entries(DETECTORS).map(([key, d]) => `
                    <div class="flex items-center gap-3 p-3 bg-navy-700/30 rounded-lg" id="progress-${key}">
                        <span class="text-lg">${d.icon}</span>
                        <span class="flex-1 text-sm text-gold-200/70">${d.name}</span>
                        <span class="text-xs text-gold-200/50">Waiting...</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    const results = [];
    
    // Run detectors with progress updates
    const updateProgress = (id, status, color = 'text-gold-200/50') => {
        const el = document.querySelector(`#progress-${id} span:last-child`);
        if (el) {
            el.textContent = status;
            el.className = `text-xs ${color}`;
        }
    };
    
    // Run ZeroGPT (with API key)
    const zerogptKey = getDetectorKey('zerogpt');
    updateProgress('zerogpt', zerogptKey ? 'Checking...' : 'No key');
    if (zerogptKey) {
        try {
            const zerogptResult = await detectWithZeroGPT(text, zerogptKey);
            results.push(zerogptResult);
            updateProgress('zerogpt', zerogptResult.error ? `Error` : `${zerogptResult.aiScore}% AI`, 
                zerogptResult.error ? 'text-red-400' : 'text-emerald-400');
        } catch (e) {
            results.push({ detector: 'zerogpt', error: e.message });
            updateProgress('zerogpt', 'Failed', 'text-red-400');
        }
    } else {
        updateProgress('zerogpt', 'Add key ↑', 'text-gold-200/40');
    }
    
    // Run GPTZero (requires free API key)
    const gptzeroKey = getDetectorKey('gptzero');
    updateProgress('gptzero', gptzeroKey ? 'Checking...' : 'No key');
    if (gptzeroKey) {
        try {
            const gptzeroResult = await detectWithGPTZero(text, gptzeroKey);
            results.push(gptzeroResult);
            updateProgress('gptzero', gptzeroResult.error ? 'Error' : `${gptzeroResult.aiScore}% AI`,
                gptzeroResult.error ? 'text-red-400' : 'text-emerald-400');
        } catch (e) {
            results.push({ detector: 'gptzero', error: e.message });
            updateProgress('gptzero', 'Failed', 'text-red-400');
        }
    } else {
        updateProgress('gptzero', 'Add key ↑', 'text-gold-200/40');
    }
    
    // Run Sapling AI (requires free API key)
    const saplingKey = getDetectorKey('sapling');
    updateProgress('sapling', saplingKey ? 'Checking...' : 'No key');
    if (saplingKey) {
        try {
            const saplingResult = await detectWithSapling(text, saplingKey);
            results.push(saplingResult);
            updateProgress('sapling', saplingResult.error ? 'Error' : `${saplingResult.aiScore}% AI`,
                saplingResult.error ? 'text-red-400' : 'text-emerald-400');
        } catch (e) {
            results.push({ detector: 'sapling', error: e.message });
            updateProgress('sapling', 'Failed', 'text-red-400');
        }
    } else {
        updateProgress('sapling', 'Add key ↑', 'text-gold-200/40');
    }
    
    // Small delay to show final progress
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Display results
    displayDetectionResults(results);
    
    // Reset UI
    isAnalyzing = false;
    analyzeBtn.disabled = false;
    document.getElementById('analyzeBtnIcon').textContent = '🔬';
    document.getElementById('analyzeBtnText').textContent = 'Run All Detectors';
}

function displayDetectionResults(results) {
    // Calculate averages from successful detections
    const successfulResults = results.filter(r => !r.error && r.aiScore !== undefined);
    const avgAiScore = successfulResults.length > 0 
        ? Math.round(successfulResults.reduce((sum, r) => sum + r.aiScore, 0) / successfulResults.length)
        : null;
    
    const getScoreColor = (score) => {
        if (score >= 70) return 'text-red-400';
        if (score >= 40) return 'text-yellow-400';
        return 'text-emerald-400';
    };
    
    const getScoreBg = (score) => {
        if (score >= 70) return 'bg-red-500/20 border-red-500/30';
        if (score >= 40) return 'bg-yellow-500/20 border-yellow-500/30';
        return 'bg-emerald-500/20 border-emerald-500/30';
    };
    
    const getVerdict = (score) => {
        if (score >= 70) return 'Likely AI-Generated';
        if (score >= 40) return 'Mixed/Uncertain';
        return 'Likely Human-Written';
    };
    
    analysisResults.innerHTML = `
        <div class="space-y-5">
            <!-- Aggregate Score -->
            ${avgAiScore !== null ? `
            <div class="text-center p-6 ${getScoreBg(avgAiScore)} rounded-xl border">
                <div class="text-xs text-gold-200/60 mb-1 uppercase tracking-wide">Average AI Score</div>
                <div class="text-5xl font-bold ${getScoreColor(avgAiScore)} mb-2">${avgAiScore}%</div>
                <div class="text-sm ${getScoreColor(avgAiScore)} font-medium">${getVerdict(avgAiScore)}</div>
                <div class="mt-3 text-xs text-gold-200/40">Based on ${successfulResults.length} detector${successfulResults.length !== 1 ? 's' : ''}</div>
            </div>
            ` : `
            <div class="text-center p-6 bg-navy-700/50 rounded-xl border border-gold-400/20">
                <div class="text-xl mb-2">⚠️</div>
                <div class="text-gold-200/70">No API results available</div>
                <div class="text-xs text-gold-200/40 mt-1">Add API keys above to enable detectors</div>
            </div>
            `}
            
            <!-- Individual Results -->
            <div class="space-y-2">
                <h4 class="text-sm font-semibold text-gold-200/80">Detector Results</h4>
                ${results.map(r => {
                    if (r.error) {
                        return `
                            <div class="flex items-center justify-between p-3 bg-navy-700/30 rounded-lg border border-navy-600">
                                <div class="flex items-center gap-3">
                                    <span class="text-lg opacity-50">${DETECTORS[r.detector]?.icon || '❓'}</span>
                                    <span class="text-sm text-gold-200/50">${DETECTORS[r.detector]?.name || r.detector}</span>
                                </div>
                                <span class="text-xs text-gold-200/40">${r.error === 'No API key' ? 'No API key' : r.error}</span>
                            </div>
                        `;
                    }
                    return `
                        <div class="flex items-center justify-between p-3 ${getScoreBg(r.aiScore)} rounded-lg border">
                            <div class="flex items-center gap-3">
                                <span class="text-lg">${r.icon}</span>
                                <div>
                                    <span class="text-sm text-white font-medium">${r.name}</span>
                                    <span class="text-xs text-gold-200/50 ml-2">${r.verdict}</span>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-lg font-bold ${getScoreColor(r.aiScore)}">${r.aiScore}%</div>
                                <div class="text-[10px] text-gold-200/40">AI Probability</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <!-- Manual Verification Note -->
            <div class="text-center p-3 bg-navy-700/20 rounded-lg text-xs text-gold-200/40">
                👇 For additional verification, use the manual links below
            </div>
        </div>
    `;
}

function loadFromWriter() {
    const writerContent = draftOutput.innerText;
    if (writerContent && !writerContent.includes('AI-Powered Essay Writer') && !writerContent.includes('Multi-Detector Analysis')) {
        analyzerInput.value = writerContent;
        showToast('Essay loaded from Writer');
    } else {
        showToast('No essay found in Writer tab');
    }
}

function openDetector(url) {
    const text = analyzerInput.value.trim();
    if (text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Text copied! Paste it in the detector');
            window.open(url, '_blank');
        }).catch(() => {
            window.open(url, '_blank');
        });
    } else {
        showToast('Enter some text first');
    }
}

// Initialize analyzer events
function initAnalyzer() {
    if (analyzeBtn) analyzeBtn.addEventListener('click', runAllDetectors);
    
    if (clearAnalyzerBtn) clearAnalyzerBtn.addEventListener('click', () => {
        analyzerInput.value = '';
        analysisResults.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center text-gray-500">
                <span class="text-5xl mb-4 opacity-50">🔬</span>
                <h3 class="text-lg font-bold text-gray-400 mb-2">Multi-Detector Analysis</h3>
                <p class="text-sm max-w-xs">Paste your essay and click "Run All Detectors" to get results from multiple AI detection services.</p>
            </div>
        `;
    });
    
    if (loadFromWriterBtn) loadFromWriterBtn.addEventListener('click', loadFromWriter);
    
    // API Keys toggle
    const toggleDetectorKeys = document.getElementById('toggleDetectorKeys');
    const detectorKeysSection = document.getElementById('detectorKeysSection');
    if (toggleDetectorKeys && detectorKeysSection) {
        toggleDetectorKeys.addEventListener('click', () => {
            detectorKeysSection.classList.toggle('hidden');
        });
    }
    
    // Save API keys button
    const saveDetectorKeysBtn = document.getElementById('saveDetectorKeysBtn');
    if (saveDetectorKeysBtn) {
        saveDetectorKeysBtn.addEventListener('click', saveDetectorKeys);
    }
    
    // Use Demo Keys button
    const useDemoKeysBtn = document.getElementById('useDemoKeysBtn');
    if (useDemoKeysBtn) {
        useDemoKeysBtn.addEventListener('click', useDemoKeys);
    }
    
    // Clear Keys button
    const clearKeysBtn = document.getElementById('clearKeysBtn');
    if (clearKeysBtn) {
        clearKeysBtn.addEventListener('click', clearDetectorKeys);
    }
    
    // Load saved API keys
    loadDetectorKeys();
    
    // Detector links
    detectorLinks.forEach(link => {
        link.addEventListener('click', () => openDetector(link.dataset.url));
    });
}

// ============================================
// ABSTRACT SUMMARIZER
// ============================================

let currentSummaryMode = 'bullets';
let currentSummary = '';

// DOM Elements for Summarizer
const summarizerInput = document.getElementById('summarizerInput');
const summarizeBtn = document.getElementById('summarizeBtn');
const summarizerOutput = document.getElementById('summarizerOutput');
const copySummaryBtn = document.getElementById('copySummaryBtn');
const summarizerCharCount = document.getElementById('summarizerCharCount');
const summaryModeBtns = document.querySelectorAll('.summary-mode-btn');

function initSummarizer() {
    if (!summarizeBtn) return;
    
    // Summarize button
    summarizeBtn.addEventListener('click', summarizeText);
    
    // Mode selection
    summaryModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            summaryModeBtns.forEach(b => {
                b.classList.remove('active', 'bg-gold-400/20', 'border-gold-400/30', 'text-gold-200');
                b.classList.add('bg-navy-700', 'text-gold-200/60');
            });
            btn.classList.add('active', 'bg-gold-400/20', 'border-gold-400/30', 'text-gold-200');
            btn.classList.remove('bg-navy-700', 'text-gold-200/60');
            currentSummaryMode = btn.dataset.mode;
        });
    });
    
    // Character count
    if (summarizerInput) {
        summarizerInput.addEventListener('input', () => {
            const count = summarizerInput.value.length;
            summarizerCharCount.textContent = `${count.toLocaleString()} characters`;
        });
    }
    
    // Copy button
    if (copySummaryBtn) {
        copySummaryBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(currentSummary).then(() => {
                showToast('Summary copied!');
            });
        });
    }
}

async function summarizeText() {
    const text = summarizerInput.value.trim();
    const apiKey = apiKeyInput?.value?.trim();
    const provider = aiProvider?.value || 'gemini';
    
    if (!text) {
        showToast('Please enter some text to summarize');
        return;
    }
    
    if (text.length < 50) {
        showToast('Please enter at least 50 characters');
        return;
    }
    
    if (!apiKey) {
        showToast('Please set your API key in the Writer tab first');
        return;
    }
    
    // Track summary analytics
    if (window.Analytics) {
        window.Analytics.trackEvent('summary_created', { mode: currentSummaryMode, charCount: text.length });
    }
    
    // Set loading state
    summarizeBtn.disabled = true;
    document.getElementById('summarizeBtnIcon').textContent = '⏳';
    document.getElementById('summarizeBtnText').textContent = 'Summarizing...';
    summarizerOutput.innerHTML = '<p class="text-gold-200/60 animate-pulse text-center">Generating summary...</p>';
    
    try {
        const prompt = buildSummaryPrompt(text, currentSummaryMode);
        let response;
        const model = AI_PROVIDERS[provider]?.model || 'gemini-2.0-flash';
        
        if (provider === 'anthropic') {
            response = await generateSummaryAnthropic(prompt, apiKey);
        } else if (provider === 'gemini' || provider === 'gemini-pro') {
            response = await generateSummaryGemini(prompt, apiKey, model);
        } else {
            response = await generateSummaryOpenAI(prompt, apiKey, model);
        }
        
        currentSummary = response;
        displaySummary(response);
        showToast('Summary generated!');
        
    } catch (error) {
        console.error('Summary error:', error);
        summarizerOutput.innerHTML = `
            <div class="text-center py-8">
                <div class="text-4xl mb-4">⚠️</div>
                <h3 class="text-lg font-bold text-red-400 mb-2">Summarization Failed</h3>
                <p class="text-gold-200/60 text-sm">${error.message}</p>
            </div>
        `;
    } finally {
        summarizeBtn.disabled = false;
        document.getElementById('summarizeBtnIcon').textContent = '📋';
        document.getElementById('summarizeBtnText').textContent = 'Summarize';
    }
}

function buildSummaryPrompt(text, mode) {
    const modeInstructions = {
        bullets: `Summarize the following academic text into 4-6 clear bullet points. Each bullet should capture a key finding, concept, or conclusion. Be concise but preserve important details and any statistics/numbers mentioned.

Format your response as a bullet list with each point on a new line starting with "• "`,
        
        paragraph: `Write a clear, concise paragraph summarizing the following academic text. The summary should be approximately 3-5 sentences and capture the main argument, key findings, and conclusions. Maintain an academic tone but make it accessible.`,
        
        eli5: `Explain the following academic text in simple terms that a 10-year-old could understand. Avoid jargon, use analogies where helpful, and focus on the main idea. Keep it friendly and engaging while still being accurate. Use 2-3 short paragraphs.`
    };
    
    return `${modeInstructions[mode]}

TEXT TO SUMMARIZE:
"""
${text}
"""

Provide only the summary, no additional commentary.`;
}

async function generateSummaryGemini(prompt, apiKey, model) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1024
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Gemini API error');
    }
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No summary generated';
}

async function generateSummaryOpenAI(prompt, apiKey, model) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 1024
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No summary generated';
}

async function generateSummaryAnthropic(prompt, apiKey) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }]
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Anthropic API error');
    }
    
    const data = await response.json();
    return data.content?.[0]?.text || 'No summary generated';
}

function displaySummary(summary) {
    // Convert bullet points to styled HTML
    let html = summary
        .replace(/^[•\-\*]\s*/gm, '<li class="flex gap-2"><span class="text-gold-400">•</span><span>')
        .replace(/\n(?=<li)/g, '</span></li>\n');
    
    // If it has list items, wrap in ul
    if (html.includes('<li')) {
        html = `<ul class="space-y-3 text-gold-200/90 leading-relaxed">${html}</span></li></ul>`;
    } else {
        // Regular paragraph
        html = `<div class="text-gold-200/90 leading-relaxed whitespace-pre-wrap">${summary}</div>`;
    }
    
    summarizerOutput.innerHTML = html;
    
    // Show copy button
    copySummaryBtn?.classList.remove('hidden');
}

// Export for global access
window.AcademicSourceFinder = {
    search: performSearch,
    copyBibTeX,
    addToSources,
    removeFromSources,
    clearAllSources,
    switchTab
};

// ============================================
// INTERACTIVE TUTORIAL SYSTEM
// ============================================

const TUTORIAL_STEPS = [
    {
        icon: '🔍',
        title: 'Find Your Sources',
        description: 'Search for academic papers by entering your topic. Results come from Semantic Scholar, CrossRef, and arXiv.',
        target: '#searchInput',
        tab: 'search',
        tabName: '🔍 Search Tab'
    },
    {
        icon: '📚',
        title: 'Select Your Sources',
        description: 'After searching, click "Add to Sources" on papers. Then click this floating button to see your selected sources!',
        target: '#sourcesToggleBtn',
        tab: 'search',
        tabName: '🔍 Search Tab'
    },
    {
        icon: '⚙️',
        title: 'Set Up AI',
        description: 'Choose Gemini (free) and click "🚀 Use Demo" to instantly get a working API key. No signup needed!',
        target: '#aiProvider',
        tab: 'writer',
        tabName: '✍️ Writer Tab'
    },
    {
        icon: '✍️',
        title: 'Generate Your Essay',
        description: 'Type your essay topic, pick a length & style, then hit this button. AI writes a fully-cited paper in seconds!',
        target: '#essayTopic',
        tab: 'writer',
        tabName: '✍️ Writer Tab'
    },
    {
        icon: '🔬',
        title: 'Check AI Detection',
        description: 'Copy your essay here to scan it with AI detectors. Use "🚀 Use Demo Keys" for instant access to detection APIs!',
        target: '#analyzerInput',
        tab: 'analyzer',
        tabName: '🔬 Analyzer Tab'
    }
];

let currentTutorialStep = 0;
let tutorialActive = false;

function initTutorial() {
    const overlay = document.getElementById('tutorialOverlay');
    const startBtn = document.getElementById('startTutorialBtn');
    const nextBtn = document.getElementById('tutorialNext');
    const prevBtn = document.getElementById('tutorialPrev');
    const skipBtn = document.getElementById('tutorialSkip');
    
    if (startBtn) startBtn.addEventListener('click', startTutorial);
    if (nextBtn) nextBtn.addEventListener('click', nextTutorialStep);
    if (prevBtn) prevBtn.addEventListener('click', prevTutorialStep);
    if (skipBtn) skipBtn.addEventListener('click', endTutorial);
    
    // Check if first visit
    if (!localStorage.getItem('tutorialCompleted')) {
        // Auto-start tutorial on first visit after a short delay
        setTimeout(() => {
            startTutorial();
        }, 1000);
    }
}

function startTutorial() {
    tutorialActive = true;
    currentTutorialStep = 0;
    document.getElementById('tutorialOverlay')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    showTutorialStep(0);
}

function endTutorial() {
    tutorialActive = false;
    document.getElementById('tutorialOverlay')?.classList.add('hidden');
    document.body.style.overflow = '';
    localStorage.setItem('tutorialCompleted', 'true');
}

function showTutorialStep(stepIndex) {
    const step = TUTORIAL_STEPS[stepIndex];
    if (!step) return endTutorial();
    
    // Switch to correct tab first
    if (step.tab) {
        switchTab(step.tab);
    }
    
    // Wait for tab transition
    setTimeout(() => {
        // Update card content
        document.getElementById('tutorialStepNum').textContent = stepIndex + 1;
        document.getElementById('tutorialStepIcon').textContent = step.icon;
        document.getElementById('tutorialTitle').textContent = step.title;
        document.getElementById('tutorialDescription').textContent = step.description;
        
        // Update tab indicator
        const tabIndicator = document.getElementById('tutorialTabIndicator');
        if (tabIndicator) {
            tabIndicator.textContent = step.tabName || '';
        }
        
        // Update progress dots
        document.querySelectorAll('.tutorial-dot').forEach((dot, i) => {
            dot.className = `tutorial-dot w-2 h-2 rounded-full transition-all ${i <= stepIndex ? 'bg-gold-400' : 'bg-gold-400/30'}`;
            if (i === stepIndex) dot.classList.add('w-4'); // Current step wider
        });
        
        // Update buttons
        const prevBtn = document.getElementById('tutorialPrev');
        const nextBtn = document.getElementById('tutorialNext');
        
        prevBtn.classList.toggle('hidden', stepIndex === 0);
        nextBtn.textContent = stepIndex === TUTORIAL_STEPS.length - 1 ? 'Finish! 🎉' : 'Next →';
        
        // Position spotlight only (card is fixed by CSS)
        positionSpotlight(step);
    }, 150);
}

function positionSpotlight(step) {
    const target = document.querySelector(step.target);
    const spotlight = document.getElementById('tutorialSpotlight');
    
    if (!target || !spotlight) return;
    
    // Scroll target into view first
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Wait for scroll, then position spotlight
    setTimeout(() => {
        const rect = target.getBoundingClientRect();
        const padding = 20; // More padding for better visibility
        
        // Position spotlight with generous padding
        spotlight.style.top = (rect.top - padding) + 'px';
        spotlight.style.left = (rect.left - padding) + 'px';
        spotlight.style.width = (rect.width + padding * 2) + 'px';
        spotlight.style.height = Math.min(rect.height + padding * 2, 300) + 'px'; // Cap height
    }, 300);
}

function nextTutorialStep() {
    currentTutorialStep++;
    if (currentTutorialStep >= TUTORIAL_STEPS.length) {
        endTutorial();
        showToast('Tutorial complete! 🎉 You\'re ready to write amazing essays!');
    } else {
        showTutorialStep(currentTutorialStep);
    }
}

function prevTutorialStep() {
    if (currentTutorialStep > 0) {
        currentTutorialStep--;
        showTutorialStep(currentTutorialStep);
    }
}

// Initialize tutorial when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initTutorial, 500);
});

