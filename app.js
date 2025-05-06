// 初始化 GUN
const gun = Gun({
    peers: ['https://gun-manhattan.herokuapp.com/gun']
});

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
    if (!player) return;
    
    let playerDiv = document.getElementById(`player-${player.id}`);
    if (!playerDiv) {
        playerDiv = document.createElement('div');
        playerDiv.id = `player-${player.id}`;
        elements.playerList.appendChild(playerDiv);
    }
    
    playerDiv.className = 'list-group-item d-flex justify-content-between align-items-center';
    playerDiv.innerHTML = `
        ${player.name}
        ${player.isHost ? '<span class="badge bg-primary">房主</span>' : ''}
    `;
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
    const initialState = {
        phase: GAME_PHASES.NIGHT_WEREWOLF,
        round: 1,
        roles: roles,
        alive: players.map(p => p.id),
        votes: {},
        nightActions: {},
        witch: {
            usedSave: false,
            usedPoison: false
        },
        discussion: {
            speaking: null,
            timeLeft: 60
        }
    };

    gun.get(`werewolf_room_${currentRoom}`).get('gameState').put(initialState);
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

    elements.gameStatus.textContent = `第 ${gameState.round} 回合 - ${gameState.phase}`;
    
    if (gameState.phase.includes('NIGHT')) {
        document.body.classList.add('night-mode');
    } else {
        document.body.classList.remove('night-mode');
    }
    
    // 如果是新的一輪開始，顯示角色
    if (gameState.round === 1 && !myRole) {
        myRole = gameState.roles[currentPlayer.id];
        showRole();
    }
    
    updateActionArea();
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
        case GAME_PHASES.DAY_DISCUSSION:
            showDiscussionActions();
            break;
        case GAME_PHASES.DAY_VOTE:
            showVoteActions();
            break;
    }
}

// 狼人行動介面
function showWerewolfActions() {
    if (hasVoted('werewolfVotes')) {
        elements.actionArea.innerHTML = '<div class="alert alert-info">已提交選擇，等待其他狼人...</div>';
        return;
    }

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
            ${!gameState.witch.usedSave && deadPlayer ? 
                `<button onclick="usePotion('save')" class="btn btn-success">使用解藥</button>` : ''}
            ${!gameState.witch.usedPoison ? 
                `<button onclick="showPoisonOptions()" class="btn btn-danger">使用毒藥</button>` : ''}
            <button onclick="skipWitchAction()" class="btn btn-secondary">跳過</button>
        </div>
    `;
}

// 討論階段介面
function showDiscussionActions() {
    const { speaking, timeLeft } = gameState.discussion;
    
    if (!speaking) {
        elements.actionArea.innerHTML = `
            <button onclick="startSpeaking()" class="btn btn-primary">要求發言</button>
        `;
    } else if (speaking === currentPlayer.id) {
        elements.actionArea.innerHTML = `
            <div class="alert alert-info">
                你正在發言中 (剩餘 ${timeLeft} 秒)
            </div>
            <button onclick="endSpeaking()" class="btn btn-secondary">結束發言</button>
        `;
    } else {
        elements.actionArea.innerHTML = `
            <div class="alert alert-info">
                ${getPlayerName(speaking)} 正在發言 (剩餘 ${timeLeft} 秒)
            </div>
        `;
    }
}

// 投票介面
function showVoteActions() {
    if (hasVoted('votes')) {
        elements.actionArea.innerHTML = '<div class="alert alert-info">已提交投票，等待其他玩家...</div>';
        return;
    }

    elements.actionArea.innerHTML = `
        <div class="alert alert-primary">
            請選擇要投票處決的玩家
        </div>
    `;
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
        
        if (isAlive && canSelectPlayer(playerId)) {
            card.classList.add('selectable');
            card.addEventListener('click', () => handlePlayerSelect(playerId));
        }
        
        elements.playerBoard.appendChild(card);
    });
}

// 檢查是否已投票
function hasVoted(voteType) {
    const votes = gameState[voteType] || {};
    return votes[currentPlayer.id] !== undefined;
}

// 判斷是否可以選擇玩家
function canSelectPlayer(targetId) {
    if (!currentPlayer.alive || targetId === currentPlayer.id) return false;
    
    const { phase } = gameState;
    switch (phase) {
        case GAME_PHASES.NIGHT_WEREWOLF:
            return myRole === ROLES.WEREWOLF && !hasVoted('werewolfVotes');
        case GAME_PHASES.NIGHT_SEER:
            return myRole === ROLES.SEER;
        case GAME_PHASES.NIGHT_WITCH:
            return myRole === ROLES.WITCH && !gameState.witch.usedPoison;
        case GAME_PHASES.DAY_VOTE:
            return !hasVoted('votes');
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

// 狼人投票
function submitWerewolfVote(targetId) {
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

// 跳過女巫行動
function skipWitchAction() {
    updateGamePhase(GAME_PHASES.DAY_DISCUSSION);
    processDayStart();
}

// 處理白天開始
function processDayStart() {
    const { werewolfKill } = gameState.nightActions;
    const { witch } = gameState;
    
    // 處理夜晚的死亡情況
    let nightDeaths = [];
    
    if (werewolfKill && (!witch.savedPlayer || witch.savedPlayer !== werewolfKill)) {
        nightDeaths.push(werewolfKill);
    }
    
    if (witch.poisonedPlayer) {
        nightDeaths.push(witch.poisonedPlayer);
    }
    
    // 更新存活玩家列表
    const newAlive = gameState.alive.filter(id => !nightDeaths.includes(id));
    gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('alive').put(newAlive);
    
    // 添加死亡通知
    nightDeaths.forEach(playerId => {
        addGameLog(`${getPlayerName(playerId)} 在昨晚死亡`, 'death');
    });
    
    // 檢查遊戲是否結束
    if (!checkGameEnd()) {
        startDiscussion();
    }
}

// 開始討論階段
function startDiscussion() {
    gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('discussion').put({
        speaking: null,
        timeLeft: 60
    });
}

// 要求發言
function startSpeaking() {
    gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('discussion').put({
        speaking: currentPlayer.id,
        timeLeft: 60
    });
}

// 結束發言
function endSpeaking() {
    if (gameState.discussion.speaking === currentPlayer.id) {
        gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('discussion').put({
            speaking: null,
            timeLeft: 0
        });
    }
}

// 提交投票
function submitDayVote(targetId) {
    gun.get(`werewolf_room_${currentRoom}`).get('gameState').get('votes').get(currentPlayer.id).put(targetId);
    addGameLog('你已提交投票');
    
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

// 添加遊戲日誌
function addGameLog(message, type = 'system') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = message;
    elements.gameLog.appendChild(logEntry);
    elements.gameLog.scrollTop = elements.gameLog.scrollHeight;
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

// 初始顯示登入區域
showLoginArea();