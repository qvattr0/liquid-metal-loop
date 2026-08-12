import { Description, Switch } from '@heroui/react';

type ToggleProps = {
  isSelected: boolean;
  onChange: (selected: boolean) => void;
  label: string;
  description?: string;
};

export function Toggle({ isSelected, onChange, label, description }: ToggleProps) {
  return (
    <Switch className="panel-toggle" isSelected={isSelected} onChange={onChange} size="sm">
      <Switch.Content>
        {label}
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
      {description ? <Description className="toggle-hint">{description}</Description> : null}
    </Switch>
  );
}
