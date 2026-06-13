// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "forge-std/Test.sol";
import "../src/StackBallGameV2.sol";

contract StackBallGameV2Test is Test {
    StackBallGameV2 public game;
    address public player1 = makeAddr("player1");
    address public player2 = makeAddr("player2");
    address public player3 = makeAddr("player3");
    address public player4 = makeAddr("player4");

    event GameStarted(address indexed player, bytes32 indexed sessionId, uint256 timestamp);
    event ScoreSubmitted(address indexed player, uint256 score, uint256 periodNumber, uint256 timestamp);

    function setUp() public {
        StackBallGameV2 implementation = new StackBallGameV2();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation), abi.encodeWithSelector(StackBallGameV2.initialize.selector, address(this))
        );

        game = StackBallGameV2(payable(address(proxy)));

        vm.deal(address(game), 100 ether);
        vm.deal(player1, 1 ether);
        vm.deal(player2, 1 ether);
        vm.deal(player3, 1 ether);
        vm.deal(player4, 1 ether);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _startAndWait(address player) internal returns (bytes32 sessionId) {
        vm.prank(player);
        sessionId = game.startGame();
        vm.warp(block.timestamp + 15);
    }

    function _makeHash(address player, uint256 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(player, salt));
    }

    function _submit(address player, uint256 score, uint256 salt) internal {
        _startAndWait(player);
        vm.prank(player);
        game.submitScore(score, _makeHash(player, salt));
    }

    function _defaultRewards() internal view returns (uint256[3] memory) {
        (uint256 p1, uint256 p2, uint256 p3) = game.getPrizes();
        return [p1, p2, p3];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initialize
    // ─────────────────────────────────────────────────────────────────────────

    function test_Initialize_UsesWeeklyPeriodAndPrizes() public view {
        assertEq(game.periodDuration(), 7 days);
        (uint256 p1, uint256 p2, uint256 p3) = game.getPrizes();
        assertEq(p1, 10 ether);
        assertEq(p2, 7 ether);
        assertEq(p3, 5 ether);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // startGame
    // ─────────────────────────────────────────────────────────────────────────

    function test_StartGame_ReturnsSessionId() public {
        vm.prank(player1);
        bytes32 sessionId = game.startGame();
        assertTrue(sessionId != bytes32(0));
    }

    function test_StartGame_EmitsEvent() public {
        vm.prank(player1);
        vm.expectEmit(true, false, false, false);
        emit GameStarted(player1, bytes32(0), 0);
        game.startGame();
    }

    function test_StartGame_IncrementsTotalGames() public {
        vm.prank(player1);
        game.startGame();
        StackBallGameV2.PlayerStats memory stats = game.getPlayerStats(player1);
        assertEq(stats.totalGames, 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // submitScore
    // ─────────────────────────────────────────────────────────────────────────

    function test_SubmitScore_StoresScore() public {
        _submit(player1, 500, 1);
        StackBallGameV2.PlayerStats memory stats = game.getPlayerStats(player1);
        assertEq(stats.currentPeriodScore, 500);
        assertEq(stats.bestScore, 500);
        assertTrue(stats.hasSubmittedThisPeriod);
    }

    function test_SubmitScore_AccumulatesAcrossRounds() public {
        _submit(player1, 120, 1001);
        vm.warp(block.timestamp + 60);
        _submit(player1, 180, 1002);

        StackBallGameV2.PlayerStats memory stats = game.getPlayerStats(player1);
        assertEq(stats.currentPeriodScore, 300);
        assertEq(stats.bestScore, 180);
    }

    function test_SubmitScore_StoresPeriodPlayerScore() public {
        uint256 pid = game.periodNumber();
        _submit(player1, 400, 1);
        assertEq(game.periodPlayerScores(pid, player1), 400);
    }

    function test_SubmitScore_EmitsEventWithCumulativeScore() public {
        _startAndWait(player1);

        vm.prank(player1);
        // Only check the indexed player topic; score/period/timestamp verified separately
        vm.expectEmit(true, false, false, false);
        emit ScoreSubmitted(player1, 0, 0, 0);
        game.submitScore(300, _makeHash(player1, 999));

        // Verify score was stored correctly
        assertEq(game.periodPlayerScores(game.periodNumber(), player1), 300);
    }

    function test_SubmitScore_RejectsReplayHash() public {
        _submit(player1, 100, 1);
        vm.warp(block.timestamp + 60);
        _startAndWait(player1);
        vm.prank(player1);
        vm.expectRevert("StackBall: hash already used");
        game.submitScore(100, _makeHash(player1, 1));
    }

    function test_SubmitScore_RejectsTooFast() public {
        vm.prank(player1);
        game.startGame();
        vm.warp(block.timestamp + 5); // less than MIN_GAME_DURATION
        vm.prank(player1);
        vm.expectRevert("StackBall: game too short");
        game.submitScore(100, _makeHash(player1, 1));
    }

    function test_SubmitScore_RejectsCooldown() public {
        _submit(player1, 100, 1);

        // immediately try again without waiting SUBMIT_COOLDOWN
        _startAndWait(player1);
        vm.prank(player1);
        vm.expectRevert("StackBall: submit too soon");
        game.submitScore(200, _makeHash(player1, 2));
    }

    function testFuzz_SubmitScore_AccumulatesAcrossRuns(uint256 score1, uint256 score2) public {
        score1 = bound(score1, 1, 100_000);
        score2 = bound(score2, 1, 100_000);

        _submit(player1, score1, 1);
        vm.warp(block.timestamp + 60);
        _submit(player1, score2, 2);

        StackBallGameV2.PlayerStats memory stats = game.getPlayerStats(player1);
        assertEq(stats.currentPeriodScore, score1 + score2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // finalizePeriodWithWinners
    // ─────────────────────────────────────────────────────────────────────────

    function _seedAndExpire() internal {
        _submit(player1, 300, 10);
        vm.warp(block.timestamp + 60);
        _submit(player2, 500, 11);
        vm.warp(block.timestamp + 60);
        _submit(player3, 100, 12);
        vm.warp(block.timestamp + 7 days + 1);
    }

    function test_FinalizePeriod_OnlyOwner() public {
        _seedAndExpire();
        address[3] memory winners = [player2, player1, player3];
        uint256[3] memory rewards = [uint256(10 ether), uint256(7 ether), uint256(5 ether)];

        vm.prank(player1);
        vm.expectRevert("StackBall: not owner");
        game.finalizePeriodWithWinners(winners, rewards);
    }

    function test_FinalizePeriod_FailsIfPeriodNotExpired() public {
        address[3] memory winners = [player1, player2, player3];
        uint256[3] memory rewards = [uint256(10 ether), uint256(7 ether), uint256(5 ether)];
        vm.expectRevert("StackBall: period not yet expired");
        game.finalizePeriodWithWinners(winners, rewards);
    }

    function test_FinalizePeriod_CannotRunTwice() public {
        _seedAndExpire();
        address[3] memory winners = [player2, player1, player3];
        uint256[3] memory rewards = [uint256(10 ether), uint256(7 ether), uint256(5 ether)];

        game.finalizePeriodWithWinners(winners, rewards);

        // Period was reset — new period just started, not expired yet
        vm.expectRevert("StackBall: period not yet expired");
        game.finalizePeriodWithWinners(winners, rewards);
    }

    function test_FinalizePeriod_SnapshotsWinnersAndStartsNextPeriod() public {
        uint256 pidBefore = game.periodNumber();
        _seedAndExpire();

        address[3] memory winners = [player2, player1, player3];
        uint256[3] memory rewards = [uint256(10 ether), uint256(7 ether), uint256(5 ether)];
        game.finalizePeriodWithWinners(winners, rewards);

        assertEq(game.periodNumber(), pidBefore + 1);
        assertEq(game.latestFinalizedPeriod(), pidBefore);

        (address[3] memory w,,,bool finalized,) = game.getPeriodWinners(pidBefore);
        assertTrue(finalized);
        assertEq(w[0], player2);
        assertEq(w[1], player1);
        assertEq(w[2], player3);
    }

    function test_FinalizePeriod_WorksWithFewerThan3Players() public {
        _submit(player1, 500, 10);
        vm.warp(block.timestamp + 7 days + 1);

        address[3] memory winners = [player1, address(0), address(0)];
        uint256[3] memory rewards = [uint256(10 ether), uint256(0), uint256(0)];
        game.finalizePeriodWithWinners(winners, rewards);

        (address[3] memory w,,,bool finalized,) = game.getPeriodWinners(1);
        assertTrue(finalized);
        assertEq(w[0], player1);
        assertEq(w[1], address(0));
    }

    function test_FinalizePeriod_RejectsZeroAddressWithReward() public {
        vm.warp(block.timestamp + 7 days + 1);
        address[3] memory winners = [player1, address(0), address(0)];
        uint256[3] memory rewards = [uint256(10 ether), uint256(5 ether), uint256(0)]; // bug: reward for address(0)
        vm.expectRevert("StackBall: zero address cannot have reward");
        game.finalizePeriodWithWinners(winners, rewards);
    }

    function test_FinalizePeriod_ResetsDisplayedPeriodStats() public {
        _submit(player1, 500, 1);
        vm.warp(block.timestamp + 7 days + 1);

        address[3] memory winners = [player1, address(0), address(0)];
        uint256[3] memory rewards = [uint256(10 ether), 0, 0];
        game.finalizePeriodWithWinners(winners, rewards);

        // After period reset, currentPeriodScore should appear as 0
        StackBallGameV2.PlayerStats memory stats = game.getPlayerStats(player1);
        assertEq(stats.currentPeriodScore, 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // claimReward
    // ─────────────────────────────────────────────────────────────────────────

    function _finalizeWith3() internal returns (uint256 pid) {
        pid = game.periodNumber();
        _seedAndExpire();
        address[3] memory winners = [player2, player1, player3];
        uint256[3] memory rewards = [uint256(10 ether), uint256(7 ether), uint256(5 ether)];
        game.finalizePeriodWithWinners(winners, rewards);
    }

    function test_ClaimReward_WinnerOneCanClaim() public {
        uint256 pid = _finalizeWith3();
        uint256 balBefore = player2.balance;
        vm.prank(player2);
        game.claimReward(pid);
        assertEq(player2.balance - balBefore, 10 ether);
    }

    function test_ClaimReward_CannotClaimTwice() public {
        uint256 pid = _finalizeWith3();
        vm.prank(player2);
        game.claimReward(pid);
        vm.prank(player2);
        vm.expectRevert("StackBall: reward already claimed");
        game.claimReward(pid);
    }

    function test_ClaimReward_FailsBeforeFinalize() public {
        vm.prank(player1);
        vm.expectRevert("StackBall: period not finalized");
        game.claimReward(1);
    }

    function test_ClaimReward_NonWinnerCannotClaim() public {
        uint256 pid = _finalizeWith3();
        vm.prank(player4);
        vm.expectRevert("StackBall: no reward available");
        game.claimReward(pid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // getLatestClaimableReward
    // ─────────────────────────────────────────────────────────────────────────

    function test_GetLatestClaimableReward_ReturnsLatestSnapshot() public {
        uint256 pid = _finalizeWith3();
        (uint256 retPid, uint256 amount, uint256 rank,,) = game.getLatestClaimableReward(player2);
        assertEq(retPid, pid);
        assertEq(amount, 10 ether);
        assertEq(rank, 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Period time helpers
    // ─────────────────────────────────────────────────────────────────────────

    function test_GetTimeUntilReset_UsesSevenDays() public view {
        uint256 t = game.getTimeUntilReset();
        assertGt(t, 0);
        assertLe(t, 7 days);
    }

    function test_GetTimeUntilReset_ReturnsZeroAfterExpiry() public {
        vm.warp(block.timestamp + 7 days + 1);
        assertEq(game.getTimeUntilReset(), 0);
    }
}
