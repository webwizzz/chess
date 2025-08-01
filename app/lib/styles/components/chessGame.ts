import { StyleSheet } from 'react-native'
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../base'

export const chessGameStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "flex-start",
  },
  playerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
  },
  topPlayer: {
    paddingTop: 20,
  },
  bottomPlayer: {
    paddingBottom: 20,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.gray,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xlarge,
    fontWeight: "bold",
  },
  playerDetails: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  playerName: {
    color: COLORS.white,
    fontSize: FONT_SIZES.large,
    fontWeight: "500",
    marginRight: SPACING.sm,
  },
  playerRating: {
    color: COLORS.mutedText,
    fontSize: FONT_SIZES.medium,
  },
  timerContainer: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.small,
    minWidth: 70,
    alignItems: "center",
  },
  activeTimer: {
    backgroundColor: "#4a4a4a",
  },
  timer: {
    color: COLORS.white,
    fontWeight: "bold",
    fontFamily: "monospace",
    fontSize: FONT_SIZES.timer,
  },
  capturedPieces: {
    flexDirection: "row",
    alignItems: "center",
  },
  capturedPieceGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
  },
  capturedPiece: {
    color: COLORS.mutedText,
    fontSize: FONT_SIZES.small,
  },
  capturedCount: {
    color: COLORS.mutedText,
    fontSize: 10,
    marginLeft: 2,
  },
  boardContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    marginVertical: 10,
  },
  boardWrapper: {
    position: "relative",
  },
  board: {
    borderRadius: 0,
  },
  fileCoordinates: {
    flexDirection: "row",
    position: "absolute",
    bottom: -20,
    left: 0,
  },
  rankCoordinates: {
    position: "absolute",
    right: -20,
    top: 0,
  },
  coordinateText: {
    color: COLORS.mutedText,
    fontSize: FONT_SIZES.small,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
  },
  square: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  lastMoveSquare: {
    backgroundColor: COLORS.lastMoveSquare,
  },
  selectedSquare: {
    backgroundColor: COLORS.selectedSquare,
  },
  piece: {
    fontWeight: "bold",
    color: COLORS.black,
    textShadowColor: "rgba(255,255,255,0.3)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  possibleMoveDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primaryGreen,
    opacity: 0.9,
  },
  captureDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.red,
    opacity: 0.9,
    top: 4,
    right: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.modalOverlay,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  moveHistoryModal: {
    backgroundColor: COLORS.modalBackground,
    borderRadius: BORDER_RADIUS.large,
    width: "90%",
    maxWidth: 400,
    maxHeight: "70%",
    borderWidth: 1,
    borderColor: "#555",
  },
  moveHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#555",
  },
  moveHistoryTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xlarge,
    fontWeight: "bold",
  },
  closeButton: {
    padding: SPACING.sm,
  },
  closeButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xlarge,
    fontWeight: "bold",
  },
  moveHistoryScroll: {
    flex: 1,
    padding: SPACING.lg,
  },
  moveRow: {
    flexDirection: "row",
    marginBottom: SPACING.sm,
    alignItems: "center",
  },
  moveNumber: {
    color: COLORS.mutedText,
    fontSize: FONT_SIZES.medium,
    width: 30,
    fontWeight: "bold",
  },
  moveText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.medium,
    width: 60,
    marginHorizontal: SPACING.sm,
  },
  gameEndModal: {
    backgroundColor: COLORS.modalBackground,
    borderRadius: BORDER_RADIUS.large,
    padding: SPACING.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
    maxWidth: "90%",
  },
  gameEndTitle: {
    fontSize: FONT_SIZES.title,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: SPACING.lg,
    color: COLORS.white,
  },
  gameEndMessage: {
    fontSize: FONT_SIZES.large,
    textAlign: "center",
    marginBottom: SPACING.xl,
    color: COLORS.white,
    lineHeight: 22,
  },
  gameEndDetails: {
    marginBottom: SPACING.lg,
  },
  gameEndDetailText: {
    color: COLORS.mutedText,
    fontSize: FONT_SIZES.medium,
    textAlign: "center",
    marginBottom: 4,
  },
  promotionModal: {
    backgroundColor: COLORS.modalBackground,
    borderRadius: BORDER_RADIUS.large,
    padding: SPACING.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
  },
  promotionTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xlarge,
    fontWeight: "bold",
    marginBottom: SPACING.xl,
    textAlign: "center",
  },
  promotionOptions: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: SPACING.xl,
    flexWrap: "wrap",
  },
  promotionOption: {
    margin: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.lightSquare,
    borderRadius: SPACING.sm,
    minWidth: 50,
    minHeight: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  promotionPiece: {
    fontSize: 28,
    textAlign: "center",
    color: COLORS.black,
  },
  cancelButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: 10,
    backgroundColor: COLORS.gray,
    borderRadius: SPACING.sm,
  },
  cancelButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.large,
    fontWeight: "bold",
  },
  bottomBar: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  bottomBarButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: SPACING.sm,
    minWidth: 60,
  },
  bottomBarIcon: {
    fontSize: FONT_SIZES.title,
    marginBottom: 4,
    color: COLORS.mutedText,
    fontWeight: "bold",
  },
  bottomBarLabel: {
    color: COLORS.white,
    fontSize: FONT_SIZES.small,
    fontWeight: "500",
  },
  
  // Crazy House specific styles
  pocketContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: "#1a1a1a",
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  pocketPiece: {
    marginHorizontal: SPACING.xs,
    padding: SPACING.sm,
    backgroundColor: COLORS.darkGray,
    borderRadius: BORDER_RADIUS.small,
    minWidth: 40,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  pocketPieceText: {
    fontSize: FONT_SIZES.large,
    fontWeight: "bold",
  },
  pocketPieceCount: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: COLORS.red,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  pocketPieceCountText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "bold",
  },
  dropPieceHighlight: {
    backgroundColor: COLORS.blue,
  },
  pocketTimer: {
    position: "absolute",
    bottom: -2,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.timerLow,
    borderRadius: 1,
  },
})
