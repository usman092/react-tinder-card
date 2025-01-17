/* global WebKitCSSMatrix */

const React = require("react");
const sleep = require("p-sleep");

const settings = {
  snapBackDuration: 300,
  maxTilt: 5,
  bouncePower: 0.2,
  swipeThreshold: 300, // px/s
};
const SCROLL_STARTED = "scrollStarted";
const SWIPE_STARTED = "swipeStarted";
const NOOP = "noop";

const getOverlayColor = (pos, xDiff) => {
  if (pos.x > 0) {
    return (
      "rgba(0," +
      "255," +
      "0," +
      Math.abs(window.innerWidth - (window.innerWidth - pos.x)) /
        window.innerWidth +
      ")"
    );
  } else if (pos.x < 0) {
    return (
      "rgba(255," +
      "0," +
      "0," +
      Math.abs(window.innerWidth - (window.innerWidth - pos.x)) /
        window.innerWidth +
      ")"
    );
  }

  return "rgba(0,0,0,0)";
};

const getElementSize = (element) => {
  const elementStyles = window.getComputedStyle(element);
  const widthString = elementStyles.getPropertyValue("width");
  const width = Number(widthString.split("px")[0]);
  const heightString = elementStyles.getPropertyValue("height");
  const height = Number(heightString.split("px")[0]);
  return { x: width, y: height };
};

const pythagoras = (x, y) => {
  return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
};

const animateOut = async (element, speed, overlayDiv, easeIn = false) => {
  const startPos = getTranslate(element);
  const bodySize = getElementSize(document.body);
  const diagonal = pythagoras(bodySize.x, bodySize.y);

  const velocity = pythagoras(speed.x, speed.y);
  const time = diagonal / velocity;
  const multiplier = diagonal / velocity;

  const translateString = translationString(
    speed.x * multiplier + startPos.x,
    -speed.y * multiplier + startPos.y
  );
  let rotateString = "";

  const rotationPower = 200;

  if (easeIn) {
    element.style.transition = "ease " + time + "s";
  } else {
    element.style.transition = "ease-out " + time + "s";
  }

  if (getRotation(element) === 0) {
    rotateString = rotationString((Math.random() - 0.5) * rotationPower);
  } else if (getRotation(element) > 0) {
    rotateString = rotationString(
      (Math.random() * rotationPower) / 2 + getRotation(element)
    );
  } else {
    rotateString = rotationString(
      ((Math.random() - 1) * rotationPower) / 2 + getRotation(element)
    );
  }

  element.style.transform = translateString + rotateString;
  overlayDiv.style.backgroundColor = "rgba(0,0,0,0)";

  await sleep(time * 1000);
};

const animateBack = (element, overlayElement) => {
  element.style.transition = settings.snapBackDuration + "ms";
  const startingPoint = getTranslate(element);
  const translation = translationString(
    startingPoint.x * -settings.bouncePower,
    startingPoint.y * -settings.bouncePower
  );
  const rotation = rotationString(getRotation(element) * -settings.bouncePower);
  element.style.transform = translation + rotation;
  overlayElement.style.backgroundColor = "rgba(0,0,0,0)";

  setTimeout(() => {
    element.style.transform = "none";
  }, settings.snapBackDuration * 0.75);

  setTimeout(() => {
    element.style.transition = "10ms";
    overlayElement.style.transition = "10ms";
  }, settings.snapBackDuration);
};

const getSwipeDirection = (speed) => {
  if (Math.abs(speed.x) > Math.abs(speed.y)) {
    return speed.x > 0 ? "right" : "left";
  } else {
    return speed.y > 0 ? "up" : "down";
  }
};

const calcSpeed = (oldLocation, newLocation) => {
  const dx = newLocation.x - oldLocation.x;
  const dy = oldLocation.y - newLocation.y;
  const dt = (newLocation.time - oldLocation.time) / 1000;
  return { x: dx / dt, y: dy / dt };
};

const translationString = (x, y) => {
  const translation = "translate(" + x + "px, " + y + "px)";
  return translation;
};

const rotationString = (rot) => {
  const rotation = "rotate(" + rot + "deg)";
  return rotation;
};

const getTranslate = (element) => {
  const style = window.getComputedStyle(element);
  const matrix = new WebKitCSSMatrix(style.webkitTransform);
  const ans = { x: matrix.m41, y: matrix.m42 };
  return ans;
};

const getRotation = (element) => {
  const style = window.getComputedStyle(element);
  const matrix = new WebKitCSSMatrix(style.webkitTransform);
  const ans = (-Math.asin(matrix.m21) / (2 * Math.PI)) * 360;
  return ans;
};

const dragableTouchmove = (
  coordinates,
  element,
  offset,
  lastLocation,
  operationState,
  overlayElement
) => {
  const pos = {
    x: coordinates.x + offset.x,
    y: 0 /*coordinates.y + offset.y*/,
  };
  const newLocation = { x: pos.x, y: pos.y, time: new Date().getTime() };
  const translation = translationString(pos.x, pos.y);
  const rotCalc = calcSpeed(lastLocation, newLocation).x / 1000;
  const rotation = rotationString(rotCalc * settings.maxTilt);
  if (
    (Math.abs(newLocation.x - lastLocation.x) >
      Math.abs(coordinates.y + offset.y - lastLocation.y) ||
      operationState === SWIPE_STARTED) &&
    operationState !== SCROLL_STARTED
  ) {
    element.style.transform = translation + rotation;
    overlayElement.style.backgroundColor = getOverlayColor(
      pos,
      newLocation.x - lastLocation.x
    );
    return [newLocation, SWIPE_STARTED];
  }
  if (
    Math.abs(coordinates.y + offset.y - lastLocation.y) > 0 &&
    operationState !== SWIPE_STARTED
  ) {
    return [lastLocation, SCROLL_STARTED];
  }

  return [lastLocation, operationState];
};

const touchCoordinatesFromEvent = (e) => {
  const touchLocation = e.targetTouches[0];
  return { x: touchLocation.clientX, y: touchLocation.clientY };
};

const mouseCoordinatesFromEvent = (e) => {
  return { x: e.clientX, y: e.clientY };
};

const TinderCard = React.forwardRef(
  (
    {
      flickOnSwipe = true,
      children,
      onSwipe,
      onCardLeftScreen,
      className,
      preventSwipe = [],
    },
    ref
  ) => {
    const swipeAlreadyReleased = React.useRef(false);
    const operationInProgress = React.useRef(NOOP);

    const element = React.useRef();
    const overlayElement = React.useRef();

    React.useImperativeHandle(ref, () => ({
      async swipe(dir = "right") {
        if (onSwipe) onSwipe(dir);
        const power = 1000;
        const disturbance = (Math.random() - 0.5) * 100;
        if (dir === "right") {
          await animateOut(
            element.current,
            { x: power, y: disturbance },
            overlayElement.current,
            true
          );
        } else if (dir === "left") {
          await animateOut(
            element.current,
            { x: -power, y: disturbance },
            true
          );
        } else if (dir === "up") {
          await animateOut(
            element.current,
            { x: disturbance, y: power },
            overlayElement.current,
            true
          );
        } else if (dir === "down") {
          await animateOut(
            element.current,
            { x: disturbance, y: -power },
            overlayElement.current,
            true
          );
        }
        element.current.style.display = "none";
        if (onCardLeftScreen) onCardLeftScreen(dir);
      },
    }));

    const handleSwipeReleased = React.useCallback(
      async (element, overlayElement, speed) => {
        if (swipeAlreadyReleased.current) {
          return;
        }
        swipeAlreadyReleased.current = true;

        // Check if this is a swipe
        if (
          Math.abs(speed.x) > settings.swipeThreshold ||
          Math.abs(speed.y) > settings.swipeThreshold
        ) {
          const dir = getSwipeDirection(speed);
          if (onSwipe) onSwipe(dir);

          if (flickOnSwipe) {
            if (!preventSwipe.includes(dir)) {
              await animateOut(element, speed, overlayElement);
              element.style.display = "none";
              if (onCardLeftScreen) onCardLeftScreen(dir);
              return;
            }
          }
        }

        // Card was not flicked away, animate back to start
        animateBack(element, overlayElement);
      },
      [
        swipeAlreadyReleased,
        flickOnSwipe,
        onSwipe,
        onCardLeftScreen,
        preventSwipe,
      ]
    );

    const handleSwipeStart = React.useCallback(() => {
      swipeAlreadyReleased.current = false;
    }, [swipeAlreadyReleased]);

    React.useLayoutEffect(() => {
      let offset = { x: null, y: null };
      let speed = { x: 0, y: 0 };
      let lastLocation = { x: 0, y: 0, time: new Date().getTime() };
      let mouseIsClicked = false;

      element.current.addEventListener("touchstart", (ev) => {
        // ev.preventDefault();
        handleSwipeStart();
        offset = {
          x: -touchCoordinatesFromEvent(ev).x,
          y: -touchCoordinatesFromEvent(ev).y,
        };
      });

      element.current.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        mouseIsClicked = true;
        handleSwipeStart();
        offset = {
          x: -mouseCoordinatesFromEvent(ev).x,
          y: -mouseCoordinatesFromEvent(ev).y,
        };
      });

      element.current.addEventListener("touchmove", (ev) => {
        if (operationInProgress.current === SCROLL_STARTED) {
          speed = 0;
          lastLocation = { x: 0, y: 0, time: new Date().getTime() };
          return;
        } else if (operationInProgress.current === SWIPE_STARTED) {
          ev.preventDefault();
        }
        //ev.preventDefault(); commented to enable scrolling on ios devices
        const [newLocation, operationState] = dragableTouchmove(
          touchCoordinatesFromEvent(ev),
          element.current,
          offset,
          lastLocation,
          operationInProgress.current,
          overlayElement.current
        );
        speed = calcSpeed(lastLocation, newLocation);
        lastLocation = newLocation;
        operationInProgress.current = operationState;
      });

      element.current.addEventListener("mousemove", (ev) => {
        ev.preventDefault();
        if (mouseIsClicked) {
          const [newLocation, operationState] = dragableTouchmove(
            mouseCoordinatesFromEvent(ev),
            element.current,
            offset,
            lastLocation,
            operationInProgress.current,
            overlayElement.current
          );
          speed = calcSpeed(lastLocation, newLocation);
          lastLocation = newLocation;
          operationInProgress.current = operationState;
        }
      });

      element.current.addEventListener("touchend", (ev) => {
        if (operationInProgress.current === SWIPE_STARTED) {
          ev.preventDefault();
          handleSwipeReleased(element.current, overlayElement.current, speed);
        }
        operationInProgress.current = NOOP;
      });

      element.current.addEventListener("mouseup", (ev) => {
        if (mouseIsClicked) {
          ev.preventDefault();
          mouseIsClicked = false;
          handleSwipeReleased(element.current, speed);
        }
      });

      element.current.addEventListener("mouseleave", (ev) => {
        if (mouseIsClicked) {
          ev.preventDefault();
          mouseIsClicked = false;
          handleSwipeReleased(element.current, speed);
        }
      });
    }, []);

    const overlayDiv = React.createElement("div", {
      className: "blaaaa",
      ref: overlayElement,
      style: {
        backgroundColor: "rgba(0,255,0,0)",
        height: "100%",
        width: "100%",
        position: "absolute",
        zIndex: 99,
        pointerEvents: "none",
      },
    });

    return React.createElement(
      "div",
      { ref: element, className },
      overlayDiv,
      children
    );
  }
);

module.exports = TinderCard;
