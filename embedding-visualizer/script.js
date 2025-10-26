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

// Settings state
let visualizationSettings = {
    dimensionMode: '2d',
    axes: {
        x: { method: 'tsne', config: {} },
        y: { method: 'tsne', config: {} },
        z: { method: 'tsne', config: {} }
    }
};

// 3D rotation state
let rotationX = 0.5;  // Rotation around X axis (pitch)
let rotationY = 0.5;  // Rotation around Y axis (yaw)
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

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
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('click', handleClick);

    // Settings modal listeners
    document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
    document.querySelector('.close').addEventListener('click', closeSettingsModal);
    document.getElementById('cancelSettings').addEventListener('click', closeSettingsModal);
    document.getElementById('applySettings').addEventListener('click', applySettings);

    // Dimension mode change
    document.getElementById('dimensionMode').addEventListener('change', handleDimensionModeChange);

    // Axis method changes
    document.getElementById('xMethod').addEventListener('change', () => handleMethodChange('x'));
    document.getElementById('yMethod').addEventListener('change', () => handleMethodChange('y'));
    document.getElementById('zMethod').addEventListener('change', () => handleMethodChange('z'));

    // Initialize method configs
    handleMethodChange('x');
    handleMethodChange('y');
    handleMethodChange('z');

    // Close modal on outside click
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('settingsModal');
        if (event.target === modal) {
            closeSettingsModal();
        }
    });

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

// Settings Modal Functions
function openSettingsModal() {
    const modal = document.getElementById('settingsModal');

    // Load current settings into modal
    document.getElementById('dimensionMode').value = visualizationSettings.dimensionMode;
    document.getElementById('xMethod').value = visualizationSettings.axes.x.method;
    document.getElementById('yMethod').value = visualizationSettings.axes.y.method;
    document.getElementById('zMethod').value = visualizationSettings.axes.z.method;

    // Update visibility of z-axis group
    handleDimensionModeChange();

    // Update method configs
    handleMethodChange('x');
    handleMethodChange('y');
    handleMethodChange('z');

    modal.style.display = 'block';
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

function handleDimensionModeChange() {
    const dimensionMode = document.getElementById('dimensionMode').value;
    const zAxisGroup = document.getElementById('zAxisGroup');

    if (dimensionMode === '3d') {
        zAxisGroup.style.display = 'block';
    } else {
        zAxisGroup.style.display = 'none';
    }
}

function handleMethodChange(axis) {
    const methodSelect = document.getElementById(`${axis}Method`);
    const configDiv = document.getElementById(`${axis}Config`);
    const method = methodSelect.value;

    // Clear existing config
    configDiv.innerHTML = '';

    if (method === 'similarity') {
        // Add text input for similarity
        const group = document.createElement('div');
        group.className = 'setting-group';

        const label = document.createElement('label');
        label.className = 'setting-label';
        label.textContent = 'Reference Text';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'setting-input';
        input.id = `${axis}SimilarityText`;
        input.placeholder = 'e.g., "Hello" or "Technical content"';

        // Load existing value if available
        if (visualizationSettings.axes[axis].config.text) {
            input.value = visualizationSettings.axes[axis].config.text;
        }

        group.appendChild(label);
        group.appendChild(input);
        configDiv.appendChild(group);

    } else if (method === 'llm_judge') {
        // Add textarea for LLM prompt
        const group = document.createElement('div');
        group.className = 'setting-group';

        const label = document.createElement('label');
        label.className = 'setting-label';
        label.textContent = 'Judge Prompt';

        const textarea = document.createElement('textarea');
        textarea.className = 'setting-input';
        textarea.id = `${axis}LlmPrompt`;
        textarea.placeholder = 'Enter the prompt for the LLM judge to evaluate this dimension...';

        // Load existing value if available
        if (visualizationSettings.axes[axis].config.prompt) {
            textarea.value = visualizationSettings.axes[axis].config.prompt;
        }

        group.appendChild(label);
        group.appendChild(textarea);
        configDiv.appendChild(group);
    }
    // For 'tsne', no additional config needed
}

function applySettings() {
    // Collect settings from modal
    const dimensionMode = document.getElementById('dimensionMode').value;

    visualizationSettings.dimensionMode = dimensionMode;

    // Collect axis configurations
    ['x', 'y', 'z'].forEach(axis => {
        const method = document.getElementById(`${axis}Method`).value;
        visualizationSettings.axes[axis].method = method;
        visualizationSettings.axes[axis].config = {};

        if (method === 'similarity') {
            const textInput = document.getElementById(`${axis}SimilarityText`);
            if (textInput) {
                visualizationSettings.axes[axis].config.text = textInput.value;
            }
        } else if (method === 'llm_judge') {
            const promptInput = document.getElementById(`${axis}LlmPrompt`);
            if (promptInput) {
                visualizationSettings.axes[axis].config.prompt = promptInput.value;
            }
        }
    });

    closeSettingsModal();

    // Clear current visualization to force reload
    visualizationData = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updateStatus('Settings updated. Click "Load Visualization" to apply.');
}

async function loadVisualization() {
    const btn = document.getElementById('loadBtn');
    btn.disabled = true;
    updateStatus('Loading conversations and computing embeddings...');

    try {
        // Send settings as POST request
        const response = await fetch(`${BACKEND_URL}/api/visualize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(visualizationSettings)
        });

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

    // Update conversation view if a message is selected
    if (selectedPoint !== null) {
        const selectedMsg = visualizationData.messages[selectedPoint];
        if (!isMessageVisible(selectedMsg)) {
            selectedPoint = null;
            document.querySelector('.placeholder').style.display = 'block';
            document.getElementById('conversationContent').classList.remove('active');
        } else {
            // Refresh the conversation view to show filtered state
            showConversation(selectedMsg.conversation_id);
        }
    }

    draw();
}

function isMessageVisible(message) {
    const passesModelFilter = activeFilters.size === 0 || activeFilters.has(message.speaker);
    const passesConversationFilter = activeConversationFilter === null || message.conversation_id === activeConversationFilter;
    return passesModelFilter && passesConversationFilter;
}

// 3D Projection Functions
function rotate3D(x, y, z, rotX, rotY) {
    // Rotate around Y axis (yaw)
    let cosY = Math.cos(rotY);
    let sinY = Math.sin(rotY);
    let x1 = x * cosY - z * sinY;
    let z1 = x * sinY + z * cosY;

    // Rotate around X axis (pitch)
    let cosX = Math.cos(rotX);
    let sinX = Math.sin(rotX);
    let y1 = y * cosX - z1 * sinX;
    let z2 = y * sinX + z1 * cosX;

    return { x: x1, y: y1, z: z2 };
}

function project3DTo2D(x, y, z, canvasWidth, canvasHeight) {
    // Simple perspective projection
    const fov = 500;  // Field of view
    const scale = fov / (fov + z);

    return {
        x: canvasWidth / 2 + x * scale,
        y: canvasHeight / 2 + y * scale,
        scale: scale
    };
}

function handleMouseDown(event) {
    if (visualizationData && visualizationData.dimensionMode === '3d') {
        isDragging = true;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
        canvas.style.cursor = 'grabbing';
    }
}

function handleMouseUp() {
    isDragging = false;
    if (visualizationData && visualizationData.dimensionMode === '3d') {
        canvas.style.cursor = 'grab';
    }
}

function draw() {
    if (!visualizationData) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const is3D = visualizationData.dimensionMode === '3d';

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

    let zValues, zMin, zMax, zRange;
    if (is3D) {
        zValues = visualizationData.messages.map(m => m.z || 0);
        zMin = Math.min(...zValues);
        zMax = Math.max(...zValues);
        zRange = zMax - zMin;
    }

    // Transform function
    const transform = (x, y, z) => {
        if (!is3D) {
            // 2D mode
            const screenX = padding + ((x - xMin) / xRange) * (canvas.width - 2 * padding);
            const screenY = padding + ((y - yMin) / yRange) * (canvas.height - 2 * padding);
            return { x: screenX, y: screenY, scale: 1 };
        } else {
            // 3D mode
            // Normalize coordinates to center around origin
            const normX = ((x - xMin) / xRange - 0.5) * 400;
            const normY = ((y - yMin) / yRange - 0.5) * 400;
            const normZ = ((z - zMin) / zRange - 0.5) * 400;

            // Apply rotation
            const rotated = rotate3D(normX, normY, normZ, rotationX, rotationY);

            // Project to 2D
            return project3DTo2D(rotated.x, rotated.y, rotated.z, canvas.width, canvas.height);
        }
    };

    // Group messages by conversation
    const conversationMessages = {};
    visualizationData.messages.forEach(msg => {
        if (!conversationMessages[msg.conversation_id]) {
            conversationMessages[msg.conversation_id] = [];
        }
        conversationMessages[msg.conversation_id].push(msg);
    });

    // For 3D, we need to sort by depth for proper rendering
    let sortedMessages = [...visualizationData.messages];
    if (is3D) {
        // Calculate depth for each message
        sortedMessages = sortedMessages.map((msg, idx) => {
            const pos = transform(msg.x, msg.y, msg.z || 0);
            return { msg, idx, depth: pos.scale };
        }).sort((a, b) => a.depth - b.depth); // Draw far to near
    }

    // Draw conversation lines
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3;

    Object.values(conversationMessages).forEach(messages => {
        // Sort by message index and filter visible messages
        messages.sort((a, b) => a.message_index - b.message_index);
        const visibleMessages = messages.filter(msg => isMessageVisible(msg));

        for (let i = 0; i < visibleMessages.length - 1; i++) {
            const p1 = transform(visibleMessages[i].x, visibleMessages[i].y, visibleMessages[i].z || 0);
            const p2 = transform(visibleMessages[i + 1].x, visibleMessages[i + 1].y, visibleMessages[i + 1].z || 0);

            ctx.strokeStyle = '#999';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    });

    ctx.globalAlpha = 1.0;

    // Draw points
    const messagesToDraw = is3D ? sortedMessages : visualizationData.messages.map((msg, idx) => ({ msg, idx, depth: 1 }));

    messagesToDraw.forEach(({ msg, idx }) => {
        // Skip filtered out messages
        if (!isMessageVisible(msg)) return;

        const pos = transform(msg.x, msg.y, msg.z || 0);
        const color = modelColors[msg.speaker] || '#999';

        // Determine point size (scale with depth in 3D)
        let radius = 5 * pos.scale;
        const isSelected = selectedPoint === idx;
        const isHovered = hoveredPoint === idx;

        if (isSelected) {
            radius = 9 * pos.scale;
        } else if (isHovered) {
            radius = 7 * pos.scale;
        }

        // Draw glow effect for selected point
        if (isSelected) {
            // Outer glow
            ctx.shadowBlur = 20 * pos.scale;
            ctx.shadowColor = color;

            // Draw multiple layers for stronger glow
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius + (8 - i * 2) * pos.scale, 0, 2 * Math.PI);
                ctx.fill();
            }

            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 15 * pos.scale;
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
        ctx.lineWidth = (isSelected ? 2 : 1) * pos.scale;
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;
    });
}

function findNearestPoint(mouseX, mouseY) {
    if (!visualizationData) return null;

    const is3D = visualizationData.dimensionMode === '3d';
    const padding = 50;
    const xValues = visualizationData.messages.map(m => m.x);
    const yValues = visualizationData.messages.map(m => m.y);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;

    let zValues, zMin, zMax, zRange;
    if (is3D) {
        zValues = visualizationData.messages.map(m => m.z || 0);
        zMin = Math.min(...zValues);
        zMax = Math.max(...zValues);
        zRange = zMax - zMin;
    }

    const transform = (x, y, z) => {
        if (!is3D) {
            const screenX = padding + ((x - xMin) / xRange) * (canvas.width - 2 * padding);
            const screenY = padding + ((y - yMin) / yRange) * (canvas.height - 2 * padding);
            return { x: screenX, y: screenY };
        } else {
            const normX = ((x - xMin) / xRange - 0.5) * 400;
            const normY = ((y - yMin) / yRange - 0.5) * 400;
            const normZ = ((z - zMin) / zRange - 0.5) * 400;
            const rotated = rotate3D(normX, normY, normZ, rotationX, rotationY);
            return project3DTo2D(rotated.x, rotated.y, rotated.z, canvas.width, canvas.height);
        }
    };

    let nearestIdx = null;
    let minDist = 15; // Threshold distance

    visualizationData.messages.forEach((msg, idx) => {
        // Skip filtered out messages
        if (!isMessageVisible(msg)) return;

        const pos = transform(msg.x, msg.y, msg.z || 0);
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

    // Handle 3D rotation
    if (isDragging && visualizationData && visualizationData.dimensionMode === '3d') {
        const deltaX = event.clientX - lastMouseX;
        const deltaY = event.clientY - lastMouseY;

        rotationY += deltaX * 0.01;
        rotationX += deltaY * 0.01;

        // Clamp rotation X to prevent flipping
        rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationX));

        lastMouseX = event.clientX;
        lastMouseY = event.clientY;

        draw();
        return;
    }

    const nearestIdx = findNearestPoint(mouseX, mouseY);

    if (nearestIdx !== hoveredPoint) {
        hoveredPoint = nearestIdx;
        const is3D = visualizationData && visualizationData.dimensionMode === '3d';
        canvas.style.cursor = hoveredPoint !== null ? 'pointer' : (is3D ? 'grab' : 'crosshair');
        draw();
    }
}

function handleClick(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const nearestIdx = findNearestPoint(mouseX, mouseY);

    if (nearestIdx !== null) {
        selectMessage(nearestIdx);
    }
}

function selectMessage(messageIdx) {
    selectedPoint = messageIdx;
    const message = visualizationData.messages[messageIdx];

    showConversation(message.conversation_id);
    draw();
}

function showConversation(conversationId) {
    const placeholder = document.querySelector('.placeholder');
    const conversationContent = document.getElementById('conversationContent');

    placeholder.style.display = 'none';
    conversationContent.classList.add('active');

    const conversationMessages = getConversationMessages(conversationId);

    // Get conversation info
    const conversation = visualizationData.conversations.find(c => c.id === conversationId);
    const conversationName = conversation ? `${conversation.model_a} vs ${conversation.model_b}` : conversationId;

    let html = `
        <div class="conversation-actions">
            <div class="conversation-title">${conversationName}</div>
            ${activeConversationFilter === conversationId ? `
                <button class="btn-small btn-primary" onclick="showAllConversations()">
                    Show all conversations
                </button>
            ` : `
                <button class="btn-small btn-primary" onclick="showOnlyConversation('${conversationId}')">
                    Only this conversation
                </button>
            `}
        </div>
    `;

    conversationMessages.forEach((msg) => {
        const color = modelColors[msg.speaker] || '#999';
        const isVisible = isMessageVisible(msg);
        const isSelected = selectedPoint !== null &&
                          visualizationData.messages[selectedPoint].conversation_id === msg.conversation_id &&
                          visualizationData.messages[selectedPoint].message_index === msg.message_index;

        // Find the global index for this message
        const globalIdx = visualizationData.messages.findIndex(m =>
            m.conversation_id === msg.conversation_id &&
            m.message_index === msg.message_index &&
            m.speaker === msg.speaker
        );

        html += `
            <div class="conversation-message ${isSelected ? 'selected' : ''} ${!isVisible ? 'filtered-out' : ''}"
                 data-message-idx="${globalIdx}"
                 id="msg-${globalIdx}">
                <div class="message-header">
                    <span class="speaker-badge" style="background-color: ${color};">
                        ${msg.speaker}
                    </span>
                    <span class="message-index">Message ${msg.message_index + 1}</span>
                </div>
                <div class="message-text">${escapeHtml(msg.text)}</div>
            </div>
        `;
    });

    conversationContent.innerHTML = html;

    // Add click handlers to messages
    conversationContent.querySelectorAll('.conversation-message').forEach(msgEl => {
        const msgIdx = parseInt(msgEl.dataset.messageIdx);
        const msg = visualizationData.messages[msgIdx];

        if (isMessageVisible(msg)) {
            msgEl.addEventListener('click', () => {
                selectMessage(msgIdx);
            });
        }
    });

    // Scroll selected message into view within the conversation container
    if (selectedPoint !== null) {
        const selectedEl = document.getElementById(`msg-${selectedPoint}`);
        const conversationView = document.getElementById('conversationView');
        if (selectedEl && conversationView) {
            // Calculate the position relative to the conversation view
            const containerRect = conversationView.getBoundingClientRect();
            const elementRect = selectedEl.getBoundingClientRect();
            const relativeTop = elementRect.top - containerRect.top;

            // Scroll within the conversation view to center the selected message
            const scrollOffset = conversationView.scrollTop + relativeTop - (conversationView.clientHeight / 2) + (elementRect.height / 2);
            conversationView.scrollTo({ top: scrollOffset, behavior: 'smooth' });
        }
    }
}

function getConversationMessages(conversationId) {
    if (!visualizationData) return [];

    return visualizationData.messages
        .filter(msg => msg.conversation_id === conversationId)
        .sort((a, b) => a.message_index - b.message_index);
}


function showOnlyConversation(conversationId) {
    // Set the conversation filter
    activeConversationFilter = conversationId;

    // Reset model filters to show all models
    activeFilters.clear();

    // Update legend and redraw
    updateLegend();

    // Refresh conversation view if one is shown
    if (selectedPoint !== null) {
        const selectedMsg = visualizationData.messages[selectedPoint];
        showConversation(selectedMsg.conversation_id);
    }

    draw();
}

function showAllConversations() {
    // Clear the conversation filter
    activeConversationFilter = null;

    // Update legend and redraw
    updateLegend();

    // Refresh conversation view if one is shown
    if (selectedPoint !== null) {
        const selectedMsg = visualizationData.messages[selectedPoint];
        showConversation(selectedMsg.conversation_id);
    }

    draw();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}