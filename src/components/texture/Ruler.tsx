interface RulerProps {
  orientation: "horizontal" | "vertical";
  length: number;
  cmLength: number;
}

export function Ruler({ orientation, length, cmLength }: RulerProps) {
  const isHorizontal = orientation === "horizontal";
  const ticks = Math.ceil(cmLength);
  const tickSpacing = length / cmLength;
  const lineColor = "var(--theme-primary)";
  const labelColor = "var(--theme-primary)";

  return (
    <div
      className={`relative ${isHorizontal ? "h-6" : "w-6"}`}
      style={isHorizontal ? { width: length } : { height: length }}
    >
      {/* Línea base */}
      <div
        className="absolute"
        style={{
          backgroundColor: lineColor,
          opacity: 0.8,
          ...(isHorizontal
            ? { left: 0, right: 0, bottom: 0, height: "1.5px" }
            : { top: 0, bottom: 0, right: 0, width: "1.5px" }),
        }}
      />

      {/* Marcas y números */}
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const position = i * tickSpacing;
        const isMajor = i % 5 === 0;
        const isFirst = i === 0;
        const isLast = i === ticks;

        return (
          <div
            key={i}
            className="absolute"
            style={
              isHorizontal
                ? {
                    left: isFirst ? 0 : isLast ? length : position,
                    bottom: 0,
                    height: isMajor ? "10px" : "6px",
                  }
                : {
                    top: isFirst ? 0 : isLast ? length : position,
                    right: 0,
                    width: isMajor ? "10px" : "6px",
                  }
            }
          >
            {/* Marca de tick */}
            <div
              className="absolute"
              style={{
                backgroundColor: lineColor,
                ...(isHorizontal
                  ? {
                      width: "1px",
                      height: "100%",
                      left: isFirst ? 0 : isLast ? "100%" : "50%",
                      transform: isFirst || isLast ? "translateX(-1px)" : "translateX(-50%)",
                    }
                  : {
                      height: "1px",
                      width: "100%",
                      top: isFirst ? 0 : isLast ? "100%" : "50%",
                      transform: isFirst || isLast ? "translateY(-1px)" : "translateY(-50%)",
                    }),
              }}
            />

            {/* Número cada 5 cm */}
            {isMajor && i > 0 && (
              <span
                className="absolute text-[9px] font-mono select-none font-medium"
                style={{
                  color: labelColor,
                  ...(isHorizontal
                    ? {
                        bottom: "100%",
                        left: isLast ? "100%" : isFirst ? 0 : "50%",
                        transform: isLast ? "translateX(-100%)" : isFirst ? "translateX(0)" : "translateX(-50%)",
                        marginBottom: "1px",
                      }
                    : {
                        right: "100%",
                        top: isLast ? "100%" : isFirst ? 0 : "50%",
                        transform: isLast ? "translateY(-100%)" : isFirst ? "translateY(0)" : "translateY(-50%)",
                        marginRight: "2px",
                      }),
                }}
              >
                {i}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
