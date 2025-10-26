// Configuration - Backend URL (can be changed for deployment)
const BACKEND_URL = 'http://localhost:8000';

// State
let visualizationData = null;
let canvas = null;
let ctx = null;
let modelColors = {};
let hoveredPoint = null;
let selectedPoint = null;
let activeFilters = new Set(); // Empty set means all models are shown
let activeConversationFilter = null; // null means show all conversations

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    // Set up canvas size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Set up event listeners
    document.getElementById('loadBtn').addEventListener('click', loadVisualization);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    updateStatus('Ready. Click "Load Visualization" to start.');
});

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth - 40;
    canvas.height = container.clientHeight - 40;

    if (visualizationData) {
        draw();
    }
}

function updateStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#dc3545' : '#666';
}

async function loadVisualization() {
    const btn = document.getElementById('loadBtn');
    btn.disabled = true;
    updateStatus('Loading conversations and computing embeddings...');

    try {
        const response = await fetch(`${BACKEND_URL}/api/visualize?method=tsne`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        visualizationData = await response.json();

        // Assign colors to models
        assignModelColors();

        // Draw visualization
        draw();

        // Update legend
        updateLegend();

        updateStatus(`Loaded ${visualizationData.messages.length} messages from ${visualizationData.conversations.length} conversations`);
    } catch (error) {
        console.error('Error loading visualization:', error);
        updateStatus(`Error: ${error.message}`, true);
    } finally {
        btn.disabled = false;
    }
}

function assignModelColors() {
    const models = new Set();
    visualizationData.messages.forEach(msg => models.add(msg.speaker));

    // Generate distinct colors for each model
    const colors = [
        '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
        '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
        '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
        '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
    ];

    Array.from(models).forEach((model, idx) => {
        modelColors[model] = colors[idx % colors.length];
    });
}

function updateLegend() {
    const legend = document.getElementById('legend');
    legend.innerHTML = '<h4>Models (click to filter)</h4>';

    Object.entries(modelColors).forEach(([model, color]) => {
        const item = document.createElement('div');
        item.className = 'legend-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'legend-checkbox';
        checkbox.checked = activeFilters.size === 0 || activeFilters.has(model);
        checkbox.dataset.model = model;
        checkbox.addEventListener('change', handleFilterChange);

        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = color;

        const label = document.createElement('div');
        label.className = 'legend-label';
        label.textContent = model;

        // Allow clicking the whole item to toggle checkbox
        item.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                handleFilterChange({ target: checkbox });
            }
        });

        item.appendChild(checkbox);
        item.appendChild(colorBox);
        item.appendChild(label);
        legend.appendChild(item);
    });
}

function handleFilterChange(event) {
    const model = event.target.dataset.model;
    const isChecked = event.target.checked;

    if (isChecked) {
        activeFilters.add(model);
    } else {
        activeFilters.delete(model);
    }

    // If all models are unchecked, show all
    if (activeFilters.size === 0) {
        Object.keys(modelColors).forEach(m => activeFilters.add(m));
        updateLegend();
    }

    // Reset selection if filtered out
    if (selectedPoint !== null) {
        const selectedMsg = visualizationData.messages[selectedPoint];
        if (!isMessageVisible(selectedMsg)) {
            selectedPoint = null;
            document.querySelector('.placeholder').style.display = 'block';
            document.getElementById('messageContent').classList.remove('active');
        }
    }

    draw();
}

function isMessageVisible(message) {
    const passesModelFilter = activeFilters.size === 0 || activeFilters.has(message.speaker);
    const passesConversationFilter = activeConversationFilter === null || message.conversation_id === activeConversationFilter;
    return passesModelFilter && passesConversationFilter;
}

function draw() {
    if (!visualizationData) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate bounds
    const padding = 50;
    const xValues = visualizationData.messages.map(m => m.x);
    const yValues = visualizationData.messages.map(m => m.y);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;

    // Transform function
    const transform = (x, y) => {
        const screenX = padding + ((x - xMin) / xRange) * (canvas.width - 2 * padding);
        const screenY = padding + ((y - yMin) / yRange) * (canvas.height - 2 * padding);
        return { x: screenX, y: screenY };
    };

    // Group messages by conversation
    const conversationMessages = {};
    visualizationData.messages.forEach(msg => {
        if (!conversationMessages[msg.conversation_id]) {
            conversationMessages[msg.conversation_id] = [];
        }
        conversationMessages[msg.conversation_id].push(msg);
    });

    // Draw conversation lines
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3;

    Object.values(conversationMessages).forEach(messages => {
        // Sort by message index and filter visible messages
        messages.sort((a, b) => a.message_index - b.message_index);
        const visibleMessages = messages.filter(msg => isMessageVisible(msg));

        for (let i = 0; i < visibleMessages.length - 1; i++) {
            const p1 = transform(visibleMessages[i].x, visibleMessages[i].y);
            const p2 = transform(visibleMessages[i + 1].x, visibleMessages[i + 1].y);

            ctx.strokeStyle = '#999';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    });

    ctx.globalAlpha = 1.0;

    // Draw points
    visualizationData.messages.forEach((msg, idx) => {
        // Skip filtered out messages
        if (!isMessageVisible(msg)) return;

        const pos = transform(msg.x, msg.y);
        const color = modelColors[msg.speaker] || '#999';

        // Determine point size
        let radius = 5;
        const isSelected = selectedPoint === idx;
        const isHovered = hoveredPoint === idx;

        if (isSelected) {
            radius = 9;
        } else if (isHovered) {
            radius = 7;
        }

        // Draw glow effect for selected point
        if (isSelected) {
            // Outer glow
            ctx.shadowBlur = 20;
            ctx.shadowColor = color;

            // Draw multiple layers for stronger glow
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius + 8 - i * 2, 0, 2 * Math.PI);
                ctx.fill();
            }

            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }

        // Draw main point
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.3)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;
    });
}

function findNearestPoint(mouseX, mouseY) {
    if (!visualizationData) return null;

    const padding = 50;
    const xValues = visualizationData.messages.map(m => m.x);
    const yValues = visualizationData.messages.map(m => m.y);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;

    const transform = (x, y) => {
        const screenX = padding + ((x - xMin) / xRange) * (canvas.width - 2 * padding);
        const screenY = padding + ((y - yMin) / yRange) * (canvas.height - 2 * padding);
        return { x: screenX, y: screenY };
    };

    let nearestIdx = null;
    let minDist = 15; // Threshold distance

    visualizationData.messages.forEach((msg, idx) => {
        // Skip filtered out messages
        if (!isMessageVisible(msg)) return;

        const pos = transform(msg.x, msg.y);
        const dist = Math.sqrt((pos.x - mouseX) ** 2 + (pos.y - mouseY) ** 2);

        if (dist < minDist) {
            minDist = dist;
            nearestIdx = idx;
        }
    });

    return nearestIdx;
}

function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const nearestIdx = findNearestPoint(mouseX, mouseY);

    if (nearestIdx !== hoveredPoint) {
        hoveredPoint = nearestIdx;
        canvas.style.cursor = hoveredPoint !== null ? 'pointer' : 'crosshair';
        draw();
    }
}

function handleClick(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const nearestIdx = findNearestPoint(mouseX, mouseY);

    if (nearestIdx !== null) {
        selectedPoint = nearestIdx;
        showMessageDetails(visualizationData.messages[nearestIdx]);
        draw();
    }
}

function showMessageDetails(message) {
    const placeholder = document.querySelector('.placeholder');
    const messageContent = document.getElementById('messageContent');

    placeholder.style.display = 'none';
    messageContent.classList.add('active');

    const color = modelColors[message.speaker] || '#999';

    // Get navigation info
    const conversationMessages = getConversationMessages(message.conversation_id);
    const currentIndex = conversationMessages.findIndex(m =>
        m.message_index === message.message_index && m.speaker === message.speaker
    );
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < conversationMessages.length - 1;

    messageContent.innerHTML = `
        <div class="message-actions">
            ${activeConversationFilter === message.conversation_id ? `
                <button class="btn-small btn-primary" onclick="showAllConversations()">
                    Show all
                </button>
            ` : `
                <button class="btn-small btn-primary" onclick="showOnlyConversation('${message.conversation_id}')">
                    Only this
                </button>
            `}
            <div class="message-nav-buttons">
                <button class="btn-small" id="prevMsgBtn" ${!hasPrev ? 'disabled' : ''}>
                    ← Prev
                </button>
                <button class="btn-small" id="nextMsgBtn" ${!hasNext ? 'disabled' : ''}>
                    Next →
                </button>
            </div>
        </div>
        <div class="message-field">
            <div class="message-field-label">
                <span class="speaker-badge" style="background-color: ${color};">
                    ${message.speaker}
                </span>
                &nbsp;• Message ${message.message_index + 1}/${conversationMessages.length}
            </div>
            <div class="message-field-value">${escapeHtml(message.text)}</div>
        </div>
    `;

    // Add event listeners for navigation buttons
    const prevBtn = document.getElementById('prevMsgBtn');
    const nextBtn = document.getElementById('nextMsgBtn');

    if (prevBtn && !prevBtn.disabled) {
        prevBtn.addEventListener('click', () => navigateMessage(message.conversation_id, currentIndex - 1));
    }

    if (nextBtn && !nextBtn.disabled) {
        nextBtn.addEventListener('click', () => navigateMessage(message.conversation_id, currentIndex + 1));
    }
}

function getConversationMessages(conversationId) {
    if (!visualizationData) return [];

    return visualizationData.messages
        .filter(msg => msg.conversation_id === conversationId)
        .sort((a, b) => a.message_index - b.message_index);
}

function navigateMessage(conversationId, targetIndex) {
    const conversationMessages = getConversationMessages(conversationId);

    if (targetIndex < 0 || targetIndex >= conversationMessages.length) return;

    const targetMessage = conversationMessages[targetIndex];

    // Find the message index in the full messages array
    const fullIndex = visualizationData.messages.findIndex(m =>
        m.conversation_id === targetMessage.conversation_id &&
        m.message_index === targetMessage.message_index &&
        m.speaker === targetMessage.speaker
    );

    if (fullIndex !== -1) {
        selectedPoint = fullIndex;
        showMessageDetails(targetMessage);
        draw();
    }
}

function showOnlyConversation(conversationId) {
    // Set the conversation filter
    activeConversationFilter = conversationId;

    // Reset model filters to show all models
    activeFilters.clear();

    // Update legend and redraw
    updateLegend();
    draw();
}

function showAllConversations() {
    // Clear the conversation filter
    activeConversationFilter = null;

    // Update legend and redraw
    updateLegend();
    draw();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}