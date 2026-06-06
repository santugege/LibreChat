import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { IMAGE_AGENT_ID } from '~/utils/imageAgentOptions';
import ImageGenerationOptions from '../ImageGenerationOptions';

const imageAgentConversation = {
  endpoint: EModelEndpoint.agents,
  agent_id: IMAGE_AGENT_ID,
} as TConversation;

describe('ImageGenerationOptions', () => {
  it('renders as a compact footer bar for the image agent', () => {
    render(
      <RecoilRoot>
        <ImageGenerationOptions conversation={imageAgentConversation} />
      </RecoilRoot>,
    );

    const bar = screen.getByTestId('image-generation-options');
    expect(bar).toHaveClass('mt-2');
    expect(bar).toHaveClass('items-center');
    expect(screen.getByLabelText('质量')).toBeInTheDocument();
    expect(screen.getByLabelText('尺寸')).toBeInTheDocument();
  });

  it('does not render for other conversations', () => {
    render(
      <RecoilRoot>
        <ImageGenerationOptions
          conversation={{ endpoint: EModelEndpoint.openAI } as TConversation}
        />
      </RecoilRoot>,
    );

    expect(screen.queryByTestId('image-generation-options')).not.toBeInTheDocument();
  });
});
