interface FullscreenLoaderProps {
  title: string;
  copy?: string;
}

export function FullscreenLoader({ title, copy }: FullscreenLoaderProps) {
  return (
    <div className="fullscreen-loader" role="alert" aria-live="assertive">
      <div className="stack centered">
        <div className="loader-orb" aria-hidden="true" />
        <div>
          <h2 className="title" style={{ fontSize: "1.3rem" }}>
            {title}
          </h2>
          {copy ? <p className="subtitle">{copy}</p> : null}
        </div>
      </div>
    </div>
  );
}
