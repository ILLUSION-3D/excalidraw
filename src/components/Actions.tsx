import React from "react";
import { ActionManager } from "../actions/manager";
import { getNonDeletedElements } from "../element";
import { ExcalidrawElement } from "../element/types";
import { t } from "../i18n";
import { useIsMobile } from "../components/App";
import {
  canChangeSharpness,
  canHaveArrowheads,
  getTargetElements,
  hasBackground,
  hasStrokeStyle,
  hasStrokeWidth,
  hasText,
} from "../scene";
import { SHAPES } from "../shapes";
import { AppState, Zoom } from "../types";
import { capitalizeString, isTransparent, setCursorForShape } from "../utils";
import Stack from "./Stack";
import { ToolButton } from "./ToolButton";

export const SelectedShapeActions = ({
  appState,
  elements,
  renderAction,
  elementType,
}: {
  appState: AppState;
  elements: readonly ExcalidrawElement[];
  renderAction: ActionManager["renderAction"];
  elementType: ExcalidrawElement["type"];
}) => {
  const targetElements = getTargetElements(
    getNonDeletedElements(elements),
    appState,
  );
  const isEditing = Boolean(appState.editingElement);
  const isMobile = useIsMobile();
  const isRTL = document.documentElement.getAttribute("dir") === "rtl";

  const showFillIcons =
    hasBackground(elementType) ||
    targetElements.some(
      (element) =>
        hasBackground(element.type) && !isTransparent(element.backgroundColor),
    );
  const showChangeBackgroundIcons =
    hasBackground(elementType) ||
    targetElements.some((element) => hasBackground(element.type));

  return (
    <div className="panelColumn">
      {renderAction("changeStrokeColor")}
      {showChangeBackgroundIcons && renderAction("changeBackgroundColor")}
      {showFillIcons && renderAction("changeFillStyle")}

      {(hasStrokeWidth(elementType) ||
        targetElements.some((element) => hasStrokeWidth(element.type))) &&
        renderAction("changeStrokeWidth")}

      {(elementType === "freedraw" ||
        targetElements.some((element) => element.type === "freedraw")) &&
        renderAction("changeStrokeShape")}

      {(hasStrokeStyle(elementType) ||
        targetElements.some((element) => hasStrokeStyle(element.type))) && (
        <>
          {renderAction("changeStrokeStyle")}
          {renderAction("changeSloppiness")}
        </>
      )}

      {(canChangeSharpness(elementType) ||
        targetElements.some((element) => canChangeSharpness(element.type))) && (
        <>{renderAction("changeSharpness")}</>
      )}

      {(hasText(elementType) ||
        targetElements.some((element) => hasText(element.type))) && (
        <>
          {renderAction("changeFontSize")}

          {renderAction("changeFontFamily")}

          {renderAction("changeTextAlign")}
        </>
      )}

      {(canHaveArrowheads(elementType) ||
        targetElements.some((element) => canHaveArrowheads(element.type))) && (
        <>{renderAction("changeArrowhead")}</>
      )}

      {renderAction("changeOpacity")}

      <fieldset>
        <legend>{t("labels.layers")}</legend>
        <div className="buttonList">
          {renderAction("sendToBack")}
          {renderAction("sendBackward")}
          {renderAction("bringToFront")}
          {renderAction("bringForward")}
        </div>
      </fieldset>

      {targetElements.length > 1 && (
        <fieldset>
          <legend>{t("labels.align")}</legend>
          <div className="buttonList">
            {
              // swap this order for RTL so the button positions always match their action
              // (i.e. the leftmost button aligns left)
            }
            {isRTL ? (
              <>
                {renderAction("alignRight")}
                {renderAction("alignHorizontallyCentered")}
                {renderAction("alignLeft")}
              </>
            ) : (
              <>
                {renderAction("alignLeft")}
                {renderAction("alignHorizontallyCentered")}
                {renderAction("alignRight")}
              </>
            )}
            {targetElements.length > 2 &&
              renderAction("distributeHorizontally")}
            <div className="iconRow">
              {renderAction("alignTop")}
              {renderAction("alignVerticallyCentered")}
              {renderAction("alignBottom")}
              {targetElements.length > 2 &&
                renderAction("distributeVertically")}
            </div>
          </div>
        </fieldset>
      )}
      {!isMobile && !isEditing && targetElements.length > 0 && (
        <fieldset>
          <legend>{t("labels.actions")}</legend>
          <div className="buttonList">
            {renderAction("duplicateSelection")}
            {renderAction("deleteSelectedElements")}
            {renderAction("group")}
            {renderAction("ungroup")}
          </div>
        </fieldset>
      )}
    </div>
  );
};

const LIBRARY_ICON = (
  <svg viewBox="12 12 488 488">
    <path
      fill="#15aabf"
      d="M357.7,456.7l123.8-15.5L429,13.8L73.6,60L357.7,456.7z"
    />
    <path
      fill="#FA5252"
      d="M312.6,468.2l124.4-8.9L407.1,29.7L49.8,57.1L312.6,468.2z"
    />
    <path
      fill="#82C91E"
      d="M264.6,486.2H18.5V49.8h363.5v319.1C382.1,433.6,329.5,486.2,264.6,486.2z"
    />
    <path
      fill="#868E95"
      d="M382.1,372.2H270.6V486C331.6,483,380.3,433.5,382.1,372.2z"
    />
  </svg>
);

export const ShapesSwitcher = ({
  canvas,
  elementType,
  setAppState,
  isLibraryOpen,
}: {
  canvas: HTMLCanvasElement | null;
  elementType: ExcalidrawElement["type"];
  setAppState: React.Component<any, AppState>["setState"];
  isLibraryOpen: boolean;
}) => (
  <>
    {SHAPES.map(({ value, icon, key }, index) => {
      const label = t(`toolBar.${value}`);
      const letter = typeof key === "string" ? key : key[0];
      const shortcut = `${capitalizeString(letter)} ${t("helpDialog.or")} ${
        index + 1
      }`;
      return (
        <ToolButton
          className="Shape"
          key={value}
          type="radio"
          icon={icon}
          checked={elementType === value}
          name="editor-current-shape"
          title={`${capitalizeString(label)} — ${shortcut}`}
          keyBindingLabel={`${index + 1}`}
          aria-label={capitalizeString(label)}
          aria-keyshortcuts={shortcut}
          data-testid={value}
          onChange={() => {
            setAppState({
              elementType: value,
              multiElement: null,
              selectedElementIds: {},
            });
            setCursorForShape(canvas, value);
            setAppState({});
          }}
        />
      );
    })}
    <ToolButton
      className="Shape ToolIcon_type_button__library"
      type="button"
      icon={LIBRARY_ICON}
      name="editor-library"
      keyBindingLabel="9"
      aria-keyshortcuts="9"
      title={`${capitalizeString(t("toolBar.library"))} — 9`}
      aria-label={capitalizeString(t("toolBar.library"))}
      onClick={() => {
        setAppState({ isLibraryOpen: !isLibraryOpen });
      }}
    />
  </>
);

export const ZoomActions = ({
  renderAction,
  zoom,
}: {
  renderAction: ActionManager["renderAction"];
  zoom: Zoom;
}) => (
  <Stack.Col gap={1}>
    <Stack.Row gap={1} align="center">
      {renderAction("zoomIn")}
      {renderAction("zoomOut")}
      {renderAction("resetZoom")}
      <div style={{ marginInlineStart: 4 }}>
        {(zoom.value * 100).toFixed(0)}%
      </div>
    </Stack.Row>
  </Stack.Col>
);
