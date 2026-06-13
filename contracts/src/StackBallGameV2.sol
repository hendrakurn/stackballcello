// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * V2: On-chain leaderboard sorting removed. Backend maintains sorted leaderboard
 * off-chain and calls finalizePeriodWithWinners() at period end.
 * Gas savings: submitScore 280k → ~65k (77% reduction).
 */
contract StackBallGameV2 is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner) public initializer {
        __Ownable_init(owner);
        periodDuration = 7 days;
        periodStart = block.timestamp;
        periodNumber = 1;
        prize1 = 10 ether;
        prize2 = 7 ether;
        prize3 = 5 ether;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyStackBallOwner {}

    // Packed into 2 storage slots (was 4 in V1)
    struct GameSession {
        address player;    // 20 bytes ─┐ slot 1
        uint96 startTime;  // 12 bytes ─┘
        bool isActive;     // 1 byte  ─┐ slot 2
        bool isSubmitted;  // 1 byte  ─┘
    }

    struct PlayerStats {
        uint256 totalGames;
        uint256 bestScore;
        uint256 currentPeriodScore;
        uint256 currentRank;       // always 0 from contract; set by backend
        bool hasSubmittedThisPeriod;
    }

    struct PeriodRewardSnapshot {
        bool finalized;
        uint256 finalizedAt;
        address[3] winners;
        uint256[3] rewards;
        bool[3] claimed;
    }

    uint256 public periodDuration;
    uint256 public periodStart;
    uint256 public periodNumber;
    uint256 public latestFinalizedPeriod;

    uint256 public prize1;
    uint256 public prize2;
    uint256 public prize3;

    uint256 public constant MIN_GAME_DURATION = 10 seconds;
    uint256 public constant SUBMIT_COOLDOWN = 30 seconds;

    mapping(address => PlayerStats) public playerStats;
    mapping(bytes32 => GameSession) public sessions;
    mapping(address => bytes32) public activeSession;
    mapping(bytes32 => bool) public usedHashes;
    mapping(address => uint256) public lastSubmitTime;
    mapping(address => uint256) public playerStatsPeriod;
    mapping(uint256 => PeriodRewardSnapshot) private periodRewards;
    // Verifiable on-chain: score per player per period
    mapping(uint256 => mapping(address => uint256)) public periodPlayerScores;

    event GameStarted(address indexed player, bytes32 indexed sessionId, uint256 timestamp);
    // rank removed from V2 (always 0 — backend computes rank off-chain)
    event ScoreSubmitted(address indexed player, uint256 score, uint256 periodNumber, uint256 timestamp);
    event PeriodFinalized(
        uint256 indexed periodNumber,
        address winner1,
        address winner2,
        address winner3,
        uint256 reward1,
        uint256 reward2,
        uint256 reward3,
        uint256 timestamp
    );
    event RewardClaimed(address indexed winner, uint256 indexed periodNumber, uint256 amount, uint256 rank, uint256 timestamp);
    event LeaderboardReset(uint256 indexed periodNumber, uint256 timestamp);
    event PrizeDeposited(address indexed from, uint256 amount, uint256 contractBalance);

    modifier onlyStackBallOwner() {
        require(msg.sender == owner(), "StackBall: not owner");
        _;
    }

    modifier periodActive() {
        require(!_isPeriodExpired(), "StackBall: period expired, call finalizePeriod");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Game actions
    // ─────────────────────────────────────────────────────────────────────────

    function startGame() external periodActive returns (bytes32 sessionId) {
        _syncPlayerPeriod(msg.sender);

        sessionId = keccak256(
            abi.encodePacked(msg.sender, block.timestamp, block.prevrandao, playerStats[msg.sender].totalGames)
        );

        bytes32 prevSession = activeSession[msg.sender];
        if (prevSession != bytes32(0)) {
            sessions[prevSession].isActive = false;
        }

        // Packed struct: 2 SSTOREs instead of 4 (saves ~40k gas on cold access)
        sessions[sessionId] = GameSession({
            player: msg.sender,
            startTime: uint96(block.timestamp),
            isActive: true,
            isSubmitted: false
        });

        activeSession[msg.sender] = sessionId;
        playerStats[msg.sender].totalGames++;

        emit GameStarted(msg.sender, sessionId, block.timestamp);
    }

    function submitScore(uint256 totalScore, bytes32 gameHash) external periodActive {
        require(!usedHashes[gameHash], "StackBall: hash already used");

        bytes32 sessionId = activeSession[msg.sender];
        require(sessionId != bytes32(0), "StackBall: no active session");

        GameSession storage session = sessions[sessionId];
        require(session.player == msg.sender, "StackBall: not your session");
        require(session.isActive, "StackBall: session not active");
        require(!session.isSubmitted, "StackBall: already submitted");
        require(block.timestamp >= uint256(session.startTime) + MIN_GAME_DURATION, "StackBall: game too short");
        require(
            lastSubmitTime[msg.sender] == 0 || block.timestamp >= lastSubmitTime[msg.sender] + SUBMIT_COOLDOWN,
            "StackBall: submit too soon"
        );
        require(totalScore > 0, "StackBall: score must be positive");

        usedHashes[gameHash] = true;
        session.isActive = false;
        session.isSubmitted = true;
        activeSession[msg.sender] = bytes32(0);
        lastSubmitTime[msg.sender] = block.timestamp;

        PlayerStats storage stats = playerStats[msg.sender];
        if (totalScore > stats.bestScore) {
            stats.bestScore = totalScore;
        }

        _syncPlayerPeriod(msg.sender);
        stats.currentPeriodScore += totalScore;
        stats.hasSubmittedThisPeriod = true;

        // Store verifiable on-chain score (no sorting — backend handles leaderboard)
        periodPlayerScores[periodNumber][msg.sender] = stats.currentPeriodScore;

        emit ScoreSubmitted(msg.sender, stats.currentPeriodScore, periodNumber, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Period finalization — called by backend after sorting off-chain
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Backend calls this with sorted top-3 winners after period expires.
     * winners[i] can be address(0) if fewer than 3 players participated.
     * rewards[i] must be 0 if winners[i] is address(0).
     */
    function finalizePeriodWithWinners(
        address[3] calldata winners,
        uint256[3] calldata rewards
    ) external onlyStackBallOwner {
        require(_isPeriodExpired(), "StackBall: period not yet expired");

        uint256 finalizedPeriod = periodNumber;
        PeriodRewardSnapshot storage snapshot = periodRewards[finalizedPeriod];
        require(!snapshot.finalized, "StackBall: period already finalized");

        uint256 totalReward = rewards[0] + rewards[1] + rewards[2];
        require(address(this).balance >= totalReward, "StackBall: insufficient balance");

        // Validate: zero address must have zero reward
        for (uint256 i = 0; i < 3; i++) {
            if (winners[i] == address(0)) {
                require(rewards[i] == 0, "StackBall: zero address cannot have reward");
            }
        }

        snapshot.finalized = true;
        snapshot.finalizedAt = block.timestamp;
        snapshot.winners[0] = winners[0];
        snapshot.winners[1] = winners[1];
        snapshot.winners[2] = winners[2];
        snapshot.rewards[0] = rewards[0];
        snapshot.rewards[1] = rewards[1];
        snapshot.rewards[2] = rewards[2];

        latestFinalizedPeriod = finalizedPeriod;

        emit PeriodFinalized(
            finalizedPeriod,
            winners[0], winners[1], winners[2],
            rewards[0], rewards[1], rewards[2],
            block.timestamp
        );

        _startNextPeriod();
    }

    function claimReward(uint256 periodId) external {
        (uint256 amount, uint256 rank, bool claimed, bool finalized) = _getClaimableReward(periodId, msg.sender);

        require(finalized, "StackBall: period not finalized");
        require(amount > 0, "StackBall: no reward available");
        require(!claimed, "StackBall: reward already claimed");
        require(address(this).balance >= amount, "StackBall: insufficient balance");

        PeriodRewardSnapshot storage snapshot = periodRewards[periodId];
        snapshot.claimed[rank - 1] = true;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "StackBall: reward transfer failed");

        emit RewardClaimed(msg.sender, periodId, amount, rank, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner functions
    // ─────────────────────────────────────────────────────────────────────────

    function forceReset() external onlyStackBallOwner {
        _startNextPeriod();
    }

    function depositPrize() external payable onlyStackBallOwner {
        require(msg.value > 0, "StackBall: must send CELO");
        emit PrizeDeposited(msg.sender, msg.value, address(this).balance);
    }

    function setPrizes(uint256 _p1, uint256 _p2, uint256 _p3) external onlyStackBallOwner {
        prize1 = _p1;
        prize2 = _p2;
        prize3 = _p3;
    }

    function emergencyWithdraw() external onlyStackBallOwner {
        (bool ok,) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "StackBall: withdraw failed");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    function getTimeUntilReset() external view returns (uint256) {
        uint256 expiry = periodStart + periodDuration;
        if (block.timestamp >= expiry) return 0;
        return expiry - block.timestamp;
    }

    function getPlayerStats(address player) external view returns (PlayerStats memory) {
        PlayerStats memory stats = playerStats[player];
        if (playerStatsPeriod[player] != periodNumber) {
            stats.currentPeriodScore = 0;
            stats.currentRank = 0;
            stats.hasSubmittedThisPeriod = false;
        }
        return stats;
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function isPeriodExpired() external view returns (bool) {
        return _isPeriodExpired();
    }

    function isPeriodFinalized(uint256 periodId) external view returns (bool) {
        return periodRewards[periodId].finalized;
    }

    function getPrizes() external view returns (uint256, uint256, uint256) {
        return (prize1, prize2, prize3);
    }

    function getPeriodWinners(uint256 periodId)
        external
        view
        returns (address[3] memory winners, uint256[3] memory rewards, bool[3] memory claimed, bool finalized, uint256 finalizedAt)
    {
        PeriodRewardSnapshot storage snapshot = periodRewards[periodId];
        return (snapshot.winners, snapshot.rewards, snapshot.claimed, snapshot.finalized, snapshot.finalizedAt);
    }

    function getClaimableReward(uint256 periodId, address player)
        external
        view
        returns (uint256 amount, uint256 rank, bool claimed, bool finalized)
    {
        return _getClaimableReward(periodId, player);
    }

    function getLatestClaimableReward(address player)
        external
        view
        returns (uint256 periodId, uint256 amount, uint256 rank, bool claimed, bool finalized)
    {
        periodId = latestFinalizedPeriod;
        if (periodId == 0) {
            return (0, 0, 0, false, false);
        }
        (amount, rank, claimed, finalized) = _getClaimableReward(periodId, player);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────

    function _getClaimableReward(uint256 periodId, address player)
        internal
        view
        returns (uint256 amount, uint256 rank, bool claimed, bool finalized)
    {
        PeriodRewardSnapshot storage snapshot = periodRewards[periodId];
        finalized = snapshot.finalized;

        if (!finalized || player == address(0)) {
            return (0, 0, false, finalized);
        }

        for (uint256 i = 0; i < 3; i++) {
            if (snapshot.winners[i] == player) {
                return (snapshot.rewards[i], i + 1, snapshot.claimed[i], true);
            }
        }

        return (0, 0, false, true);
    }

    function _isPeriodExpired() internal view returns (bool) {
        return block.timestamp >= periodStart + periodDuration;
    }

    function _syncPlayerPeriod(address player) internal {
        if (playerStatsPeriod[player] == periodNumber) {
            return;
        }

        playerStatsPeriod[player] = periodNumber;

        PlayerStats storage stats = playerStats[player];
        stats.currentPeriodScore = 0;
        stats.currentRank = 0;
        stats.hasSubmittedThisPeriod = false;
    }

    function _startNextPeriod() internal {
        periodNumber++;
        periodStart = block.timestamp;
        emit LeaderboardReset(periodNumber, block.timestamp);
    }

    receive() external payable {}
    fallback() external payable {}
}
