export type SocialIdentityInput = {
  id?: string | null;
  handle?: string | null;
  displayName?: string | null;
};

export type SocialIdentity = {
  primaryLabel: string;
  handle: string | null;
  handleLabel: string | null;
  fallbackIdLabel: string | null;
  initials: string;
};

export type SocialIdentityLabels = {
  primary: string;
  secondary: string | null;
};

function clean(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function toInitials(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "?";
  const chars = Array.from(normalized);
  if (chars.length === 1) return chars[0].toUpperCase();
  return `${chars[0]}${chars[1]}`.toUpperCase();
}

export function resolveSocialIdentity(input: SocialIdentityInput): SocialIdentity {
  const id = clean(input.id);
  const handle = clean(input.handle);
  const displayName = clean(input.displayName);
  const fallbackIdLabel = id ? id.slice(0, 8) : null;
  const primaryLabel = displayName ?? handle ?? fallbackIdLabel ?? "unknown";
  const normalizedHandle = handle ? handle.replace(/^@+/, "") : null;
  const handleLabel =
    normalizedHandle && normalizedHandle !== primaryLabel ? `@${normalizedHandle}` : null;

  return {
    primaryLabel,
    handle: normalizedHandle,
    handleLabel,
    fallbackIdLabel,
    initials: toInitials(primaryLabel),
  };
}

export function resolveSocialIdentityLabels(identity: SocialIdentity): SocialIdentityLabels {
  const fallbackHandleLike = identity.fallbackIdLabel ? `@${identity.fallbackIdLabel}` : null;
  const primary = identity.handleLabel ?? fallbackHandleLike ?? identity.primaryLabel;
  const secondary =
    identity.primaryLabel &&
    identity.primaryLabel !== primary &&
    identity.primaryLabel !== identity.fallbackIdLabel
      ? identity.primaryLabel
      : null;
  return { primary, secondary };
}

export function resolvePostAuthorIdentity(input: {
  author?: string | null;
  author_handle?: string | null;
  author_display?: string | null;
}): SocialIdentity {
  return resolveSocialIdentity({
    id: input.author ?? null,
    handle: input.author_handle ?? null,
    displayName: input.author_display ?? null,
  });
}

export function resolveNotificationActorIdentity(input: {
  actor_id?: string | null;
  actor_handle?: string | null;
  actor_display?: string | null;
}): SocialIdentity {
  return resolveSocialIdentity({
    id: input.actor_id ?? null,
    handle: input.actor_handle ?? null,
    displayName: input.actor_display ?? null,
  });
}

export type FreshPastSplit<T> = {
  fresh: T[];
  past: T[];
};

export function splitFreshPast<T>(
  items: T[],
  isPast: (item: T) => boolean
): FreshPastSplit<T> {
  const fresh: T[] = [];
  const past: T[] = [];
  for (const item of items) {
    if (isPast(item)) past.push(item);
    else fresh.push(item);
  }
  return { fresh, past };
}

export function splitByOpenedIds<T extends { id: string }>(
  items: T[],
  openedIds: ReadonlySet<string> | Record<string, unknown>
): FreshPastSplit<T> {
  const has = (id: string) =>
    openedIds instanceof Set ? openedIds.has(id) : Boolean((openedIds as Record<string, unknown>)[id]);
  return splitFreshPast(items, (item) => has(String(item.id ?? "")));
}

export function splitByReadAt<T extends { read_at?: string | null }>(items: T[]): FreshPastSplit<T> {
  return splitFreshPast(items, (item) => Boolean(item.read_at));
}
