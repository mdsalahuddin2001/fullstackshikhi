/** Privacy-enhanced YouTube embed for linking a lesson to its video. Hidden in present mode. */
export function YouTube({ id, title = 'YouTube video' }: { id: string; title?: string }) {
  return (
    <div
      data-present-hide
      className="not-prose my-6 aspect-video overflow-hidden rounded-xl border bg-fd-muted"
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={title}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="size-full"
      />
    </div>
  );
}
