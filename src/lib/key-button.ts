// Physical "key" button: a solid bottom edge that it presses into. Colors come from --key / --key-fg.
export const keyButton =
  'inline-flex items-center gap-2 rounded-lg bg-(--key) px-5 py-3 text-sm font-semibold text-(--key-fg) shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_3px_0_color-mix(in_oklab,var(--key)_55%,black)] transition-[translate,box-shadow,filter] duration-100 hover:brightness-110 active:translate-y-[3px] active:shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_0_0_transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
