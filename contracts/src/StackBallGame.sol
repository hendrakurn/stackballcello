// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract StackBallGame is Initializable, OwnableUpgradeable, UUPSUpgradeable {
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

    struct PlayerScore {
        address player;
        uint256 score;
        uint256 rank;
        uint256 submittedAt;
    }

    struct PlayerStats {
        uint256 totalGames;
        uint256 bestScore;
        uint256 currentPeriodScore;
        uint256 currentRank;
        bool hasSubmittedThisPeriod;
    }

    struct GameSession {
        address player;
        uint256 startTime;
        bool isActive;
        bool isSubmitted;
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

    uint256 public constant MAX_LEADERBOARD = 50;
    uint256 public constant MIN_GAME_DURATION = 10 seconds;
    uint256 public constant SUBMIT_COOLDOWN = 30 seconds;

    PlayerScore[] public leaderboard;
    mapping(address => PlayerStats) public playerStats;
    mapping(bytes32 => GameSession) public sessions;
    mapping(address => bytes32) public activeSession;
    mapping(bytes32 => bool) public usedHashes;
    mapping(address => uint256) public lastSubmitTime;
    mapping(address => uint256) public playerStatsPeriod;
    mapping(uint256 => PeriodRewardSnapshot) private periodRewards;

    event GameStarted(address indexed player, bytes32 indexed sessionId, uint256 timestamp);
    event ScoreSubmitted(address indexed player, uint256 score, uint256 rank, uint256 periodNumber, uint256 timestamp);
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
    event RewardsDistributed(
        address indexed winner1,
        address indexed winner2,
        address indexed winner3,
        uint256 amount1,
        uint256 amount2,
        uint256 amount3,
        uint256 periodNumber
    );
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

    function startGame() external periodActive returns (bytes32 sessionId) {
        _syncPlayerPeriod(msg.sender);

        sessionId = keccak256(
            abi.encodePacked(msg.sender, block.timestamp, block.prevrandao, playerStats[msg.sender].totalGames)
        );

        bytes32 prevSession = activeSession[msg.sender];
        if (prevSession != bytes32(0)) {
            sessions[prevSession].isActive = false;
        }

        sessions[sessionId] =
            GameSession({player: msg.sender, startTime: block.timestamp, isActive: true, isSubmitted: false});

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
        require(block.timestamp >= session.startTime + MIN_GAME_DURATION, "StackBall: game too short");
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

        uint256 rank = _updateLeaderboard(msg.sender, stats.currentPeriodScore);
        stats.currentRank = rank;

        emit ScoreSubmitted(msg.sender, stats.currentPeriodScore, rank, periodNumber, block.timestamp);
    }

    function finalizePeriod() external onlyStackBallOwner {
        _finalizePeriod();
    }

    function distributeRewards() external onlyStackBallOwner {
        _finalizePeriod();
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

    function getLeaderboard() external view returns (PlayerScore[] memory) {
        return leaderboard;
    }

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

    function getLeaderboardTop3()
        external
        view
        returns (address p1, uint256 s1, address p2, uint256 s2, address p3, uint256 s3)
    {
        uint256 len = leaderboard.length;
        if (len >= 1) {
            p1 = leaderboard[0].player;
            s1 = leaderboard[0].score;
        }
        if (len >= 2) {
            p2 = leaderboard[1].player;
            s2 = leaderboard[1].score;
        }
        if (len >= 3) {
            p3 = leaderboard[2].player;
            s3 = leaderboard[2].score;
        }
    }

    function _finalizePeriod() internal {
        require(_isPeriodExpired(), "StackBall: period not yet expired");

        uint256 finalizedPeriod = periodNumber;
        PeriodRewardSnapshot storage snapshot = periodRewards[finalizedPeriod];
        require(!snapshot.finalized, "StackBall: period already finalized");

        uint256 requiredBalance = _requiredPrizePoolForLeaderboardLength(leaderboard.length);
        require(address(this).balance >= requiredBalance, "StackBall: insufficient balance");

        snapshot.finalized = true;
        snapshot.finalizedAt = block.timestamp;

        if (leaderboard.length >= 1) {
            snapshot.winners[0] = leaderboard[0].player;
            snapshot.rewards[0] = prize1;
        }
        if (leaderboard.length >= 2) {
            snapshot.winners[1] = leaderboard[1].player;
            snapshot.rewards[1] = prize2;
        }
        if (leaderboard.length >= 3) {
            snapshot.winners[2] = leaderboard[2].player;
            snapshot.rewards[2] = prize3;
        }

        latestFinalizedPeriod = finalizedPeriod;

        emit PeriodFinalized(
            finalizedPeriod,
            snapshot.winners[0],
            snapshot.winners[1],
            snapshot.winners[2],
            snapshot.rewards[0],
            snapshot.rewards[1],
            snapshot.rewards[2],
            block.timestamp
        );

        _startNextPeriod();
    }

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

    function _requiredPrizePoolForLeaderboardLength(uint256 len) internal view returns (uint256 total) {
        if (len >= 1) {
            total += prize1;
        }
        if (len >= 2) {
            total += prize2;
        }
        if (len >= 3) {
            total += prize3;
        }
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
        delete leaderboard;
        periodNumber++;
        periodStart = block.timestamp;

        emit LeaderboardReset(periodNumber, block.timestamp);
    }

    function _updateLeaderboard(address player, uint256 score) internal returns (uint256 rank) {
        uint256 len = leaderboard.length;

        for (uint256 i = 0; i < len; i++) {
            if (leaderboard[i].player == player) {
                leaderboard[i].score = score;
                leaderboard[i].submittedAt = block.timestamp;
                _sortFrom(i);
                for (uint256 j = 0; j < leaderboard.length; j++) {
                    if (leaderboard[j].player == player) {
                        leaderboard[j].rank = j + 1;
                        return j + 1;
                    }
                }
            }
        }

        if (len < MAX_LEADERBOARD || (len > 0 && score > leaderboard[len - 1].score)) {
            if (len == MAX_LEADERBOARD) {
                leaderboard[len - 1] =
                    PlayerScore({player: player, score: score, rank: len, submittedAt: block.timestamp});
            } else {
                leaderboard.push(
                    PlayerScore({player: player, score: score, rank: len + 1, submittedAt: block.timestamp})
                );
            }

            _bubbleSort();

            for (uint256 i = 0; i < leaderboard.length; i++) {
                leaderboard[i].rank = i + 1;
                if (leaderboard[i].player == player) {
                    rank = i + 1;
                }
            }
        }
    }

    function _sortFrom(uint256 idx) internal {
        while (idx > 0 && leaderboard[idx].score > leaderboard[idx - 1].score) {
            PlayerScore memory temp = leaderboard[idx];
            leaderboard[idx] = leaderboard[idx - 1];
            leaderboard[idx - 1] = temp;
            idx--;
        }
    }

    function _bubbleSort() internal {
        uint256 n = leaderboard.length;
        for (uint256 i = 0; i < n - 1; i++) {
            for (uint256 j = 0; j < n - i - 1; j++) {
                if (leaderboard[j].score < leaderboard[j + 1].score) {
                    PlayerScore memory temp = leaderboard[j];
                    leaderboard[j] = leaderboard[j + 1];
                    leaderboard[j + 1] = temp;
                }
            }
        }
    }

    receive() external payable {}
    fallback() external payable {}
}
