// 初始化 GUN
const gun = Gun({
    peers: ['https://gun-manhattan.herokuapp.com/gun']
});

// 建立共同瀏覽的資料節點
const browser = gun.get('coBrowser');
const users = gun.get('coUsers');
let myId = Math.random().toString(36).substr(2, 9);
let myName = '訪客 ' + myId.substr(0, 4);

// DOM 元素
const urlInput = document.getElementById('urlInput');
const browserFrame = document.getElementById('browserFrame');
const usernameInput = document.getElementById('username');
const viewerCount = document.getElementById('viewerCount');
const cursorsContainer = document.getElementById('cursors');

// 設定使用者名稱
usernameInput.value = myName;
usernameInput.addEventListener('change', () => {
    myName = usernameInput.value || myName;
    updateUserStatus();
});

// 更新使用者狀態
function updateUserStatus() {
    users.get(myId).put({
        name: myName,
        lastSeen: Date.now(),
        online: true
    });
}

// 定期更新在線狀態
setInterval(updateUserStatus, 2000);

// 監聽使用者離線
window.addEventListener('beforeunload', () => {
    users.get(myId).put({ online: false });
});

// 導航功能
function navigateTo() {
    const url = urlInput.value;
    if (url) {
        browser.get('currentUrl').put(url);
    }
}

// 監聽 URL 變化
browser.get('currentUrl').on((url) => {
    if (url && url !== urlInput.value) {
        urlInput.value = url;
        browserFrame.src = url;
    }
});

// 追蹤滾動位置
browserFrame.addEventListener('load', () => {
    browserFrame.contentWindow.addEventListener('scroll', () => {
        browser.get('scroll').put({
            x: browserFrame.contentWindow.scrollX,
            y: browserFrame.contentWindow.scrollY
        });
    });
});

browser.get('scroll').on((pos) => {
    if (pos && browserFrame.contentWindow) {
        browserFrame.contentWindow.scrollTo(pos.x || 0, pos.y || 0);
    }
});

// 追蹤滑鼠位置
document.addEventListener('mousemove', (e) => {
    browser.get('cursors').get(myId).put({
        x: e.clientX,
        y: e.clientY,
        name: myName
    });
});

// 更新其他使用者的游標
browser.get('cursors').map().on((data, id) => {
    if (id !== myId && data) {
        let cursor = document.getElementById(`cursor-${id}`);
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = `cursor-${id}`;
            cursor.className = 'cursor';
            cursorsContainer.appendChild(cursor);
        }
        cursor.style.transform = `translate(${data.x}px, ${data.y}px)`;
        cursor.setAttribute('data-name', data.name || '訪客');
    }
});

// 清理離線使用者的游標
users.map().on((data, id) => {
    if (data && !data.online) {
        const cursor = document.getElementById(`cursor-${id}`);
        if (cursor) {
            cursor.remove();
        }
    }
});

// 更新在線人數
setInterval(() => {
    let count = 0;
    users.map().once((data) => {
        if (data && data.online && Date.now() - data.lastSeen < 5000) {
            count++;
        }
    });
    viewerCount.textContent = `${count} 位使用者在線`;
}, 1000);

// 遊戲常量
const ROLES = {
    VILLAGER: '村民',
    WEREWOLF: '狼人',
    SEER: '預言家',
    WITCH: '女巫'
};

const GAME_PHASES = {
    WAITING: '等待中',
    NIGHT_WEREWOLF: '狼人回合',
    NIGHT_SEER: '預言家回合',
    NIGHT_WITCH: '女巫回合',
    DAY_DISCUSSION: '討論時間',
    DAY_VOTE: '投票時間'
};

// 遊戲狀態
let currentRoom = null;
let currentPlayer = null;
let gameState = null;
let myRole = null;

// DOM 元素
const elements = {
    loginArea: document.getElementById('loginArea'),
    lobby: document.getElementById('lobby'),
    gameArea: document.getElementById('gameArea'),
    playerName: document.getElementById('playerName'),
    roomId: document.getElementById('roomId'),
    joinGame: document.getElementById('joinGame'),
    playerList: document.getElementById('playerList'),
    startGame: document.getElementById('startGame'),
    leaveGame: document.getElementById('leaveGame'),
    gameStatus: document.getElementById('gameStatus'),
    actionArea: document.getElementById('actionArea'),
    playerBoard: document.getElementById('playerBoard'),
    gameLog: document.getElementById('gameLog'),
    currentRoomSpan: document.getElementById('currentRoom'),
    werewolfCount: document.getElementById('werewolfCount'),
    roleModal: new bootstrap.Modal(document.getElementById('roleModal')),
    roleText: document.getElementById('roleText')
};

// 初始化事件監聽
elements.joinGame.addEventListener('click', handleJoinGame);
elements.startGame.addEventListener('click', handleStartGame);
elements.leaveGame.addEventListener('click', handleLeaveGame);

// 加入遊戲
async function handleJoinGame() {
    const name = elements.playerName.value.trim();
    let roomId = elements.roomId.value.trim();
    
    if (!name) {
        alert('請輸入名字！');
        return;
    }

    // 如果沒有輸入房間號，創建新房間
    if (!roomId) {
        roomId = Math.random().toString(36).substr(2, 6);
    }

    currentRoom = roomId;
    currentPlayer = {
        id: Math.random().toString(36).substr(2, 9),
        name: name,
        isHost: false,
        alive: true
    };

    // 檢查房間是否存在
    const room = gun.get(`werewolf_room_${roomId}`);
    room.get('players').once((players) => {
        if (!players) {
            // 新房間，設為房主
            currentPlayer.isHost = true;
        }
        // 加入房間
        room.get('players').get(currentPlayer.id).put(currentPlayer);
        subscribeToRoom(roomId);
        showLobby();
    });
}

// 訂閱房間更新
function subscribeToRoom(roomId) {
    const room = gun.get(`werewolf_room_${roomId}`);
    
    // 監聽玩家列表
    room.get('players').map().on((player) => {
        if (player) {
            updatePlayerList(player);
        }
    });

    // 監聽遊戲狀態
    room.get('gameState').on((state) => {
        if (state) {
            gameState = state;
            updateGameState();
        }
    });

    elements.currentRoomSpan.textContent = roomId;
}

// 更新玩家列表
function updatePlayerList(player) {
    const playerDiv = document.getElementById(`player-${player.id}`) || document.createElement('div');
    playerDiv.id = `player-${player.id}`;
    playerDiv.className = 'list-group-item d-flex justify-content-between align-items-center';
    playerDiv.innerHTML = `
        ${player.name}
        ${player.isHost ? '<span class="badge bg-primary">房主</span>' : ''}
    `;
    elements.playerList.appendChild(playerDiv);
}

// 開始遊戲
function handleStartGame() {
    if (!currentPlayer.isHost) {
        alert('只有房主可以開始遊戲！');
        return;
    }

    const players = Array.from(elements.playerList.children).map(el => ({
        id: el.id.replace('player-', ''),
        name: el.textContent.trim()
    }));

    if (players.length < 6) {
        alert('至少需要6名玩家才能開始遊戲！');
        return;
    }

    // 分配角色
    const roles = assignRoles(players);
    
    // 更新遊戲狀態
    const gameState = {
        phase: GAME_PHASES.NIGHT_WEREWOLF,
        round: 1,
        roles: roles,
        alive: players.map(p => p.id),
        votes: {},
        nightActions: {}
    };

    gun.get(`werewolf_room_${currentRoom}`).get('gameState').put(gameState);
    showGameArea();
}

// 分配角色
function assignRoles(players) {
    const roles = {};
    const playerCount = players.length;
    const werewolfCount = parseInt(elements.werewolfCount.value);
    
    // 複製玩家陣列並打亂順序
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    
    // 分配狼人
    for (let i = 0; i < werewolfCount; i++) {
        roles[shuffledPlayers[i].id] = ROLES.WEREWOLF;
    }
    
    // 分配預言家和女巫
    roles[shuffledPlayers[werewolfCount].id] = ROLES.SEER;
    roles[shuffledPlayers[werewolfCount + 1].id] = ROLES.WITCH;
    
    // 其餘為村民
    for (let i = werewolfCount + 2; i < playerCount; i++) {
        roles[shuffledPlayers[i].id] = ROLES.VILLAGER;
    }
    
    return roles;
}

// 更新遊戲狀態
function updateGameState() {
    if (!gameState) return;

    // 更新遊戲階段顯示
    elements.gameStatus.textContent = `第 ${gameState.round} 回合 - ${gameState.phase}`;
    
    // 如果是新的一輪開始，顯示角色
    if (gameState.round === 1 && !myRole) {
        myRole = gameState.roles[currentPlayer.id];
        showRole();
    }
    
    // 根據遊戲階段更新操作區域
    updateActionArea();
    
    // 更新玩家板塊
    updatePlayerBoard();
}

// 顯示角色
function showRole() {
    elements.roleText.textContent = `你的角色是：${myRole}`;
    elements.roleModal.show();
}

// 更新操作區域
function updateActionArea() {
    const { phase } = gameState;
    elements.actionArea.innerHTML = '';
    
    if (!currentPlayer.alive) {
        elements.actionArea.innerHTML = '<div class="alert alert-danger">你已經死亡</div>';
        return;
    }

    switch (phase) {
        case GAME_PHASES.NIGHT_WEREWOLF:
            if (myRole === ROLES.WEREWOLF) {
                showWerewolfActions();
            }
            break;
        case GAME_PHASES.NIGHT_SEER:
            if (myRole === ROLES.SEER) {
                showSeerActions();
            }
            break;
        case GAME_PHASES.NIGHT_WITCH:
            if (myRole === ROLES.WITCH) {
                showWitchActions();
            }
            break;
        case GAME_PHASES.DAY_VOTE:
            showVoteActions();
            break;
    }
}

// 狼人行動介面
function showWerewolfActions() {
    elements.actionArea.innerHTML = `
        <div class="alert alert-danger">
            請選擇要擊殺的玩家
        </div>
    `;
}

// 預言家行動介面
function showSeerActions() {
    elements.actionArea.innerHTML = `
        <div class="alert alert-info">
            請選擇要查驗的玩家
        </div>
    `;
}

// 女巫行動介面
function showWitchActions() {
    const deadPlayer = gameState.nightActions.werewolfKill;
    elements.actionArea.innerHTML = `
        <div class="alert alert-warning">
            ${deadPlayer ? `今晚被殺的是：${getPlayerName(deadPlayer)}` : '今晚沒有人被殺'}
        </div>
        <div class="btn-group">
            <button onclick="usePotion('save')" class="btn btn-success" ${gameState.witch?.usedSave ? 'disabled' : ''}>使用解藥</button>
            <button onclick="showPoisonOptions()" class="btn btn-danger" ${gameState.witch?.usedPoison ? 'disabled' : ''}>使用毒藥</button>
            <button onclick="skipWitchAction()" class="btn btn-secondary">跳過</button>
        </div>
    `;
}

// 投票介面
function showVoteActions() {
    elements.actionArea.innerHTML = `
        <div class="alert alert-primary">
            請選擇要投票處決的玩家
        </div>
    `;
}

// 狼人投票
function submitWerewolfVote(targetId) {
    if (targetId === currentPlayer.id) {
        alert('不能選擇自己！');
        return;
    }

    gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('nightActions').get('werewolfVotes').get(currentPlayer.id).put(targetId);
    addGameLog('你已提交投票');
    
    // 檢查是否所有狼人都已投票
    checkWerewolfVotes();
}

// 檢查狼人投票
function checkWerewolfVotes() {
    const werewolves = Object.entries(gameState.roles).filter(([_, role]) => role === ROLES.WEREWOLF);
    const votes = gameState.nightActions?.werewolfVotes || {};
    
    if (Object.keys(votes).length === werewolves.length) {
        // 統計投票
        const voteCount = {};
        Object.values(votes).forEach(targetId => {
            voteCount[targetId] = (voteCount[targetId] || 0) + 1;
        });
        
        // 找出最多票數的玩家
        const maxVotes = Math.max(...Object.values(voteCount));
        const targets = Object.entries(voteCount).filter(([_, count]) => count === maxVotes).map(([id]) => id);
        
        // 隨機選擇一個目標（如果有平票）
        const finalTarget = targets[Math.floor(Math.random() * targets.length)];
        
        // 更新夜晚行動結果
        gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('nightActions').put({
            ...gameState.nightActions,
            werewolfKill: finalTarget
        });
        
        // 進入預言家回合
        updateGamePhase(GAME_PHASES.NIGHT_SEER);
    }
}

// 預言家查驗
function checkPlayerRole(targetId) {
    const role = gameState.roles[targetId];
    const isWerewolf = role === ROLES.WEREWOLF;
    
    addGameLog(`查驗結果：${getPlayerName(targetId)} 是 ${isWerewolf ? '狼人' : '好人'}`, 'system');
    
    // 記錄預言家行動
    gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('nightActions').put({
        ...gameState.nightActions,
        seerCheck: {
            target: targetId,
            result: isWerewolf
        }
    });
    
    // 進入女巫回合
    updateGamePhase(GAME_PHASES.NIGHT_WITCH);
}

// 女巫使用藥水
function usePotion(type, targetId = null) {
    const actions = {
        save: () => {
            const target = gameState.nightActions.werewolfKill;
            gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('witch').put({
                ...gameState.witch,
                usedSave: true,
                savedPlayer: target
            });
            addGameLog('你使用了解藥');
        },
        poison: () => {
            gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('witch').put({
                ...gameState.witch,
                usedPoison: true,
                poisonedPlayer: targetId
            });
            addGameLog('你使用了毒藥');
        }
    };

    actions[type]();
    updateGamePhase(GAME_PHASES.DAY_DISCUSSION);
}

// 顯示毒藥選項
function showPoisonOptions() {
    elements.actionArea.innerHTML = `
        <div class="alert alert-danger">
            請選擇要毒殺的玩家
        </div>
    `;
}

// 跳過女巫行動
function skipWitchAction() {
    updateGamePhase(GAME_PHASES.DAY_DISCUSSION);
}

// 提交白天投票
function submitDayVote(targetId) {
    if (targetId === currentPlayer.id) {
        alert('不能投票給自己！');
        return;
    }

    gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('votes').get(currentPlayer.id).put(targetId);
    addGameLog('你已提交投票');
    
    // 檢查是否所有活著的玩家都已投票
    checkDayVotes();
}

// 檢查白天投票
function checkDayVotes() {
    const alivePlayers = gameState.alive || [];
    const votes = gameState.votes || {};
    
    if (Object.keys(votes).length === alivePlayers.length) {
        // 統計投票
        const voteCount = {};
        Object.values(votes).forEach(targetId => {
            voteCount[targetId] = (voteCount[targetId] || 0) + 1;
        });
        
        // 找出最多票數的玩家
        const maxVotes = Math.max(...Object.values(voteCount));
        const targets = Object.entries(voteCount).filter(([_, count]) => count === maxVotes).map(([id]) => id);
        
        // 處決玩家
        if (targets.length === 1) {
            const executedPlayer = targets[0];
            removePlayer(executedPlayer);
            addGameLog(`${getPlayerName(executedPlayer)} 被處決了`, 'death');
        } else {
            addGameLog('投票平局，無人被處決', 'system');
        }
        
        // 檢查遊戲是否結束
        if (!checkGameEnd()) {
            // 進入下一輪
            startNewRound();
        }
    }
}

// 移除玩家
function removePlayer(playerId) {
    const newAlive = gameState.alive.filter(id => id !== playerId);
    gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('alive').put(newAlive);
}

// 檢查遊戲結束
function checkGameEnd() {
    const alivePlayers = gameState.alive || [];
    const aliveWerewolves = alivePlayers.filter(id => gameState.roles[id] === ROLES.WEREWOLF).length;
    const aliveVillagers = alivePlayers.length - aliveWerewolves;
    
    if (aliveWerewolves === 0) {
        addGameLog('遊戲結束：好人陣營獲勝！', 'system');
        return true;
    } else if (aliveWerewolves >= aliveVillagers) {
        addGameLog('遊戲結束：狼人陣營獲勝！', 'system');
        return true;
    }
    
    return false;
}

// 開始新回合
function startNewRound() {
    gun.get(`werewolf_room_${currentRoom}`).get('gameState').put({
        ...gameState,
        round: gameState.round + 1,
        phase: GAME_PHASES.NIGHT_WEREWOLF,
        votes: {},
        nightActions: {}
    });
}

// 更新遊戲階段
function updateGamePhase(newPhase) {
    gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('phase').put(newPhase);
}

// 獲取玩家名稱
function getPlayerName(playerId) {
    const playerEl = document.getElementById(`player-${playerId}`);
    return playerEl ? playerEl.textContent.trim() : '未知玩家';
}

// 更新玩家板塊
function updatePlayerBoard() {
    elements.playerBoard.innerHTML = '';
    
    const players = Array.from(elements.playerList.children);
    players.forEach(playerEl => {
        const playerId = playerEl.id.replace('player-', '');
        const playerName = playerEl.textContent.trim();
        const isAlive = gameState.alive.includes(playerId);
        
        const card = document.createElement('div');
        card.className = `col-md-4 player-card ${isAlive ? '' : 'dead'}`;
        card.dataset.playerId = playerId;
        card.innerHTML = `
            <h4>${playerName}</h4>
            <p>${isAlive ? '存活' : '死亡'}</p>
        `;
        
        if (isAlive && canSelectPlayer()) {
            card.classList.add('selectable');
            card.addEventListener('click', () => handlePlayerSelect(playerId));
        }
        
        elements.playerBoard.appendChild(card);
    });
}

// 判斷是否可以選擇玩家
function canSelectPlayer() {
    const { phase } = gameState;
    if (!currentPlayer.alive) return false;
    
    switch (phase) {
        case GAME_PHASES.NIGHT_WEREWOLF:
            return myRole === ROLES.WEREWOLF;
        case GAME_PHASES.NIGHT_SEER:
            return myRole === ROLES.SEER;
        case GAME_PHASES.NIGHT_WITCH:
            return myRole === ROLES.WITCH;
        case GAME_PHASES.DAY_VOTE:
            return true;
        default:
            return false;
    }
}

// 處理玩家選擇
function handlePlayerSelect(targetId) {
    const { phase } = gameState;
    
    switch (phase) {
        case GAME_PHASES.NIGHT_WEREWOLF:
            submitWerewolfVote(targetId);
            break;
        case GAME_PHASES.NIGHT_SEER:
            checkPlayerRole(targetId);
            break;
        case GAME_PHASES.NIGHT_WITCH:
            handleWitchAction(targetId);
            break;
        case GAME_PHASES.DAY_VOTE:
            submitDayVote(targetId);
            break;
    }
}

// 離開遊戲
function handleLeaveGame() {
    if (currentRoom) {
        gun.get(`werewolf_room_${currentRoom}`).get('players').get(currentPlayer.id).put(null);
        showLoginArea();
        currentRoom = null;
        currentPlayer = null;
        gameState = null;
        myRole = null;
    }
}

// 介面切換函數
function showLoginArea() {
    elements.loginArea.classList.remove('d-none');
    elements.lobby.classList.add('d-none');
    elements.gameArea.classList.add('d-none');
}

function showLobby() {
    elements.loginArea.classList.add('d-none');
    elements.lobby.classList.remove('d-none');
    elements.gameArea.classList.add('d-none');
}

function showGameArea() {
    elements.loginArea.classList.add('d-none');
    elements.lobby.classList.add('d-none');
    elements.gameArea.classList.remove('d-none');
}

// 添加遊戲日誌
function addGameLog(message, type = 'system') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = message;
    elements.gameLog.appendChild(logEntry);
    elements.gameLog.scrollTop = elements.gameLog.scrollHeight;
}

// 初始顯示登入區域
showLoginArea();