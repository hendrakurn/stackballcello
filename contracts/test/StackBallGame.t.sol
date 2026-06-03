// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "forge-std/Test.sol";
import "../src/StackBallGame.sol";

contract StackBallGameTest is Test {
    StackBallGame public game;
    address public player1 = makeAddr("player1");
    address public player2 = makeAddr("player2");
    address public player3 = makeAddr("player3");
    address public player4 = makeAddr("player4");

    event GameStarted(address indexed player, bytes32 indexed sessionId, uint256 timestamp);

    function setUp() public {
        StackBallGame implementation = new StackBallGame();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation), abi.encodeWithSelector(StackBallGame.initialize.selector, address(this))
        );

        game = StackBallGame(payable(address(proxy)));

        vm.deal(address(game), 100 ether);
        vm.deal(player1, 1 ether);
        vm.deal(player2, 1 ether);
        vm.deal(player3, 1 ether);
        vm.deal(player4, 1 ether);
    }

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

    function _seedTop3() internal {
        _submit(player1, 300, 10);
        vm.warp(block.timestamp + 60);
        _submit(player2, 500, 11);
        vm.warp(block.timestamp + 60);
        _submit(player3, 100, 12);
    }

    function test_Initialize_UsesWeeklyPeriodAndUpdatedPrizes() public view {
        assertEq(game.periodDuration(), 7 days);
        (uint256 p1, uint256 p2, uint256 p3) = game.getPrizes();
        assertEq(p1, 10 ether);
        assertEq(p2, 7 ether);
        assertEq(p3, 5 ether);
    }

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
        StackBallGame.PlayerStats memory stats = game.getPlayerStats(player1);
        assertEq(stats.totalGames, 1);
    }

    function test_SubmitScore_AccumulatesCurrentPeriodScore() public {
        _submit(player1, 120, 1001);

        vm.warp(block.timestamp + 60);
        _submit(player1, 180, 1002);

        StackBallGame.PlayerStats memory stats = game.getPlayerStats(player1);
        assertEq(stats.currentPeriodScore, 300);
        assertEq(stats.bestScore, 180);
    }

    function test_SubmitScore_UpdatesLeaderboard() public {
        _submit(player1, 500, 1);
        StackBallGame.PlayerScore[] memory lb = game.getLeaderboard();
        assertEq(lb.length, 1);
        assertEq(lb[0].player, player1);
        assertEq(lb[0].score, 500);
    }

    function test_SubmitScore_RejectsReplayHash() public {
        _submit(player1, 100, 99);

        vm.warp(block.timestamp + 60);
        vm.prank(player1);
        game.startGame();
        vm.warp(block.timestamp + 15);

        vm.prank(player1);
        vm.expectRevert("StackBall: hash already used");
        game.submitScore(200, _makeHash(player1, 99));
    }

    function test_SubmitScore_RejectsTooFast() public {
        vm.prank(player1);
        game.startGame();
        vm.prank(player1);
        vm.expectRevert("StackBall: game too short");
        game.submitScore(100, _makeHash(player1, 2));
    }

    function test_SubmitScore_RejectsCooldown() public {
        _submit(player1, 100, 3);

        vm.prank(player1);
        game.startGame();
        vm.warp(block.timestamp + 15);

        vm.prank(player1);
        vm.expectRevert("StackBall: submit too soon");
        game.submitScore(200, _makeHash(player1, 4));
    }

    function test_SubmitScore_AccumulatesLeaderboardScore() public {
        _submit(player1, 500, 5);

        vm.warp(block.timestamp + 60);
        _submit(player1, 200, 6);

        StackBallGame.PlayerScore[] memory lb = game.getLeaderboard();
        assertEq(lb[0].score, 700);
    }

    function test_LeaderboardOrdering_Top3Correct() public {
        _seedTop3();

        StackBallGame.PlayerScore[] memory lb = game.getLeaderboard();
        assertEq(lb[0].player, player2);
        assertEq(lb[1].player, player1);
        assertEq(lb[2].player, player3);
        assertEq(lb[0].rank, 1);
        assertEq(lb[1].rank, 2);
        assertEq(lb[2].rank, 3);
    }

    function test_FinalizePeriod_OnlyOwner() public {
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(player1);
        vm.expectRevert("StackBall: not owner");
        game.finalizePeriod();
    }

    function test_FinalizePeriod_FailsIfPeriodNotExpired() public {
        vm.expectRevert("StackBall: period not yet expired");
        game.finalizePeriod();
    }

    function test_FinalizePeriod_SnapshotsWinnersAndStartsNextPeriod() public {
        _seedTop3();

        vm.warp(block.timestamp + 7 days + 1);
        game.finalizePeriod();

        (address[3] memory winners, uint256[3] memory rewards, bool[3] memory claimed, bool finalized,) =
            game.getPeriodWinners(1);
        assertTrue(finalized);
        assertEq(winners[0], player2);
        assertEq(winners[1], player1);
        assertEq(winners[2], player3);
        assertEq(rewards[0], 10 ether);
        assertEq(rewards[1], 7 ether);
        assertEq(rewards[2], 5 ether);
        assertFalse(claimed[0]);
        assertEq(game.latestFinalizedPeriod(), 1);
        assertEq(game.periodNumber(), 2);
        assertEq(game.getLeaderboard().length, 0);
    }

    function test_FinalizePeriod_CannotRunTwiceForSamePeriod() public {
        _seedTop3();

        vm.warp(block.timestamp + 7 days + 1);
        game.finalizePeriod();

        vm.expectRevert("StackBall: period not yet expired");
        game.finalizePeriod();
    }

    function test_ClaimReward_WinnerOneCanClaim() public {
        _seedTop3();

        vm.warp(block.timestamp + 7 days + 1);
        game.finalizePeriod();

        uint256 balanceBefore = player2.balance;
        vm.prank(player2);
        game.claimReward(1);
        assertEq(player2.balance - balanceBefore, 10 ether);

        (, uint256 rank, bool claimed, bool finalized) = game.getClaimableReward(1, player2);
        assertEq(rank, 1);
        assertTrue(claimed);
        assertTrue(finalized);
    }

    function test_ClaimReward_WinnerTwoAndThreeCanClaim() public {
        _seedTop3();

        vm.warp(block.timestamp + 7 days + 1);
        game.finalizePeriod();

        uint256 balance1Before = player1.balance;
        uint256 balance3Before = player3.balance;

        vm.prank(player1);
        game.claimReward(1);
        vm.prank(player3);
        game.claimReward(1);

        assertEq(player1.balance - balance1Before, 7 ether);
        assertEq(player3.balance - balance3Before, 5 ether);
    }

    function test_ClaimReward_NonWinnerCannotClaim() public {
        _seedTop3();

        vm.warp(block.timestamp + 7 days + 1);
        game.finalizePeriod();

        vm.prank(player4);
        vm.expectRevert("StackBall: no reward available");
        game.claimReward(1);
    }

    function test_ClaimReward_CannotClaimTwice() public {
        _seedTop3();

        vm.warp(block.timestamp + 7 days + 1);
        game.finalizePeriod();

        vm.startPrank(player2);
        game.claimReward(1);
        vm.expectRevert("StackBall: reward already claimed");
        game.claimReward(1);
        vm.stopPrank();
    }

    function test_ClaimReward_FailsBeforeFinalize() public {
        _seedTop3();

        vm.prank(player2);
        vm.expectRevert("StackBall: period not finalized");
        game.claimReward(1);
    }

    function test_ClaimReward_FailsIfBalanceInsufficientAtClaimTime() public {
        _seedTop3();

        vm.warp(block.timestamp + 7 days + 1);
        game.finalizePeriod();
        vm.deal(address(game), 0);

        vm.prank(player2);
        vm.expectRevert("StackBall: insufficient balance");
        game.claimReward(1);
    }

    function test_GetLatestClaimableReward_ReturnsLatestSnapshot() public {
        _seedTop3();

        vm.warp(block.timestamp + 7 days + 1);
        game.finalizePeriod();

        (uint256 periodId, uint256 amount, uint256 rank, bool claimed, bool finalized) = game.getLatestClaimableReward(player2);
        assertEq(periodId, 1);
        assertEq(amount, 10 ether);
        assertEq(rank, 1);
        assertFalse(claimed);
        assertTrue(finalized);
    }

    function test_FinalizePeriod_ResetsDisplayedPeriodStats() public {
        _submit(player1, 500, 31);

        vm.warp(block.timestamp + 7 days + 1);
        game.finalizePeriod();

        StackBallGame.PlayerStats memory stats = game.getPlayerStats(player1);
        assertEq(stats.currentPeriodScore, 0);
        assertEq(stats.currentRank, 0);
        assertFalse(stats.hasSubmittedThisPeriod);
        assertEq(stats.bestScore, 500);
    }

    function test_GetTimeUntilReset_UsesSevenDays() public view {
        uint256 timeLeft = game.getTimeUntilReset();
        assertApproxEqAbs(timeLeft, 7 days, 5);
    }

    function test_GetTimeUntilReset_ReturnsZeroAfterExpiry() public {
        vm.warp(block.timestamp + 7 days + 100);
        assertEq(game.getTimeUntilReset(), 0);
    }

    function testFuzz_SubmitScore_AccumulatesAcrossRuns(uint256 scoreA, uint256 scoreB) public {
        vm.assume(scoreA > 0 && scoreA < 1_000_000);
        vm.assume(scoreB > 0 && scoreB < 1_000_000);

        _submit(player1, scoreA, scoreA);
        vm.warp(block.timestamp + 60);
        _submit(player1, scoreB, scoreB + 1_000_000);

        StackBallGame.PlayerStats memory stats = game.getPlayerStats(player1);
        assertEq(stats.currentPeriodScore, scoreA + scoreB);
        assertEq(stats.bestScore, scoreA > scoreB ? scoreA : scoreB);
    }
}
