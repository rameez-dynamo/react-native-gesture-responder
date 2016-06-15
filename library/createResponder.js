/**
 * Inspired by 'PanResponder' from Facebook.
 */

'use strict';

import {InteractionManager} from 'react-native';
import TouchHistoryMath from './TouchHistoryMath';
import {pinchDistance} from './TouchDistanceMath';

const currentCentroidXOfTouchesChangedAfter = TouchHistoryMath.currentCentroidXOfTouchesChangedAfter;
const currentCentroidYOfTouchesChangedAfter = TouchHistoryMath.currentCentroidYOfTouchesChangedAfter;
const previousCentroidXOfTouchesChangedAfter = TouchHistoryMath.previousCentroidXOfTouchesChangedAfter;
const previousCentroidYOfTouchesChangedAfter = TouchHistoryMath.previousCentroidYOfTouchesChangedAfter;
const currentCentroidX = TouchHistoryMath.currentCentroidX;
const currentCentroidY = TouchHistoryMath.currentCentroidY;

const TAP_UP_TIME_THRESHOLD = 400;

function initializeGestureState(gestureState) {
  gestureState.moveX = 0;
  gestureState.moveY = 0;
  gestureState.x0 = 0;
  gestureState.y0 = 0;
  gestureState.dx = 0;
  gestureState.dy = 0;
  gestureState.vx = 0;
  gestureState.vy = 0;
  gestureState.numberActiveTouches = 0;
  // All `gestureState` accounts for timeStamps up until:
  gestureState._accountsForMovesUpTo = 0;



  gestureState.pinch = undefined;
  gestureState.previousPinch = undefined;
  gestureState.singleTapUp = false;
  gestureState.doubleTapUp = false;
  gestureState._singleTabFailed = false;

}

function updateGestureStateOnMove(gestureState, touchHistory, e) {
  console.log('updateGestureStateOnMove...mostRecentTimeStamp=' + touchHistory.mostRecentTimeStamp +
    ', timestamp=' + e.nativeEvent.timestamp + ', timeStamp=' + e.nativeEvent.timeStamp);

  const movedAfter = gestureState._accountsForMovesUpTo;
  const prevX = previousCentroidXOfTouchesChangedAfter(touchHistory, movedAfter);
  const x = currentCentroidXOfTouchesChangedAfter(touchHistory, movedAfter);
  const prevY = previousCentroidYOfTouchesChangedAfter(touchHistory, movedAfter);
  const y = currentCentroidYOfTouchesChangedAfter(touchHistory, movedAfter);
  const dx = x - prevX;
  const dy = y - prevY;

  gestureState.numberActiveTouches = touchHistory.numberActiveTouches;
  gestureState.moveX = currentCentroidXOfTouchesChangedAfter(touchHistory, movedAfter);
  gestureState.moveY = currentCentroidYOfTouchesChangedAfter(touchHistory, movedAfter);

  // TODO: This must be filtered intelligently.
  //const dt = touchHistory.mostRecentTimeStamp - movedAfter;
  const dt = convertToMillisecIfNeeded(touchHistory.mostRecentTimeStamp - movedAfter);
  gestureState.vx = dx / dt;
  gestureState.vy = dy / dt;
  gestureState.dx += dx;
  gestureState.dy += dy;
  gestureState._accountsForMovesUpTo = touchHistory.mostRecentTimeStamp;



  gestureState.pinch = pinchDistance(touchHistory, movedAfter, true);
  gestureState.previousPinch = pinchDistance(touchHistory, movedAfter, false);
}

function clearInteractionHandle(interactionState) {
  if (interactionState.handle) {
    InteractionManager.clearInteractionHandle(interactionState.handle);
    interactionState.handle = null;
  }
}

/**
 * Due to commit https://github.com/facebook/react-native/commit/f2c1868b56bdfc8b0d6f448733848eafed2cd440,
 * Android is using nanoseconds while iOS is using milliseconds.
 * @param interval
 * @returns {*}
 */
function convertToMillisecIfNeeded(interval) {
  if(interval > 1000000) {
    return interval / 1000000;
  }
  return interval;
}

export default function create(config) {
  const interactionState = {
    handle: null
  };
  const gestureState = {
    // Useful for debugging
    stateID: Math.random(),
  };
  initializeGestureState(gestureState);

  const handlers = {
    onStartShouldSetResponder: function (e) {
      return config.onStartShouldSetResponder ?
        config.onStartShouldSetResponder(e, gestureState) :
        false;
    },
    onMoveShouldSetResponder: function (e) {
      return config.onMoveShouldSetResponder ?
        config.onMoveShouldSetResponder(e, gestureState) :
        false;
    },
    onStartShouldSetResponderCapture: function (e) {
      // TODO: Actually, we should reinitialize the state any time
      // touches.length increases from 0 active to > 0 active.
      if (e.nativeEvent.touches.length === 1) {
        initializeGestureState(gestureState);
      }
      gestureState.numberActiveTouches = e.touchHistory.numberActiveTouches;
      return config.onStartShouldSetResponderCapture ?
        config.onStartShouldSetResponderCapture(e, gestureState) :
        false;
    },

    onMoveShouldSetResponderCapture: function (e) {
      const touchHistory = e.touchHistory;
      // Responder system incorrectly dispatches should* to current responder
      // Filter out any touch moves past the first one - we would have
      // already processed multi-touch geometry during the first event.
      if (gestureState._accountsForMovesUpTo === touchHistory.mostRecentTimeStamp) {
        return false;
      }
      updateGestureStateOnMove(gestureState, touchHistory, e);
      return config.onMoveShouldSetResponderCapture ?
        config.onMoveShouldSetResponderCapture(e, gestureState) :
        false;
    },

    onResponderGrant: function (e) {
      if (!interactionState.handle) {
        interactionState.handle = InteractionManager.createInteractionHandle();
      }
      gestureState._grantTimestamp = e.touchHistory.mostRecentTimeStamp;
      gestureState.x0 = currentCentroidX(e.touchHistory);
      gestureState.y0 = currentCentroidY(e.touchHistory);
      gestureState.dx = 0;
      gestureState.dy = 0;
      if (config.onResponderGrant) {
        config.onResponderGrant(e, gestureState);
      }
      // TODO: t7467124 investigate if this can be removed
      return config.onShouldBlockNativeResponder === undefined ?
        true :
        config.onShouldBlockNativeResponder();
    },

    onResponderReject: function (e) {
      clearInteractionHandle(interactionState);
      config.onResponderReject && config.onResponderReject(e, gestureState);
    },

    onResponderRelease: function (e) {
      console.log('onResponderRelease...numberActiveTouches=' + e.touchHistory.numberActiveTouches);

      if(gestureState.singleTapUp) {
        if(gestureState._lastSingleTapUp) {
          if(convertToMillisecIfNeeded(e.touchHistory.mostRecentTimeStamp - gestureState._lastReleaseTimestamp) < TAP_UP_TIME_THRESHOLD) {
            gestureState.doubleTapUp = true;
          }
        }
        gestureState._lastSingleTapUp = true;
      }
      gestureState._lastReleaseTimestamp = e.touchHistory.mostRecentTimeStamp;


      clearInteractionHandle(interactionState);
      config.onResponderRelease && config.onResponderRelease(e, gestureState);
      initializeGestureState(gestureState);
    },

    onResponderStart: function (e) {
      const touchHistory = e.touchHistory;
      gestureState.numberActiveTouches = touchHistory.numberActiveTouches;
      if (config.onResponderStart) {
        config.onResponderStart(e, gestureState);
      }
    },

    onResponderMove: function (e) {
      const touchHistory = e.touchHistory;
      // Guard against the dispatch of two touch moves when there are two
      // simultaneously changed touches.
      if (gestureState._accountsForMovesUpTo === touchHistory.mostRecentTimeStamp) {
        return;
      }
      // Filter out any touch moves past the first one - we would have
      // already processed multi-touch geometry during the first event.
      updateGestureStateOnMove(gestureState, touchHistory, e);
      if (config.onResponderMove) {
        config.onResponderMove(e, gestureState);
      }
    },

    onResponderEnd: function (e) {
      console.log('onResponderEnd...numberActiveTouches=' + e.touchHistory.numberActiveTouches);
      const touchHistory = e.touchHistory;
      gestureState.numberActiveTouches = touchHistory.numberActiveTouches;

      if(touchHistory.numberActiveTouches > 0 ||
        convertToMillisecIfNeeded(touchHistory.mostRecentTimeStamp - gestureState._grantTimestamp) > TAP_UP_TIME_THRESHOLD) {
        gestureState._singleTabFailed = true;
      }
      if(!gestureState._singleTabFailed) {
        gestureState.singleTapUp = true;
      }

      clearInteractionHandle(interactionState);
      config.onResponderEnd && config.onResponderEnd(e, gestureState);
    },

    onResponderTerminate: function (e) {
      clearInteractionHandle(interactionState);
      config.onResponderTerminate && config.onResponderTerminate(e, gestureState);
      initializeGestureState(gestureState);
    },

    onResponderTerminationRequest: function (e) {
      return config.onResponderTerminationRequest ?
        config.onResponderTerminationRequest(e. gestureState) :
        true;
    }
  };
  return {...handlers};
}