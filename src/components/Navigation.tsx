import React from 'react';
import { User, MessageCircle, Search, Shuffle, MapPin } from 'lucide-react';
import './Navigation.css';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  userRole: 'producer' | 'sharer' | 'participant';
}

export function Navigation({ activeTab, onTabChange, userRole }: NavigationProps) {
  const firstIcon = Search;
  const firstLabel = 'Produits';

  const secondIcon = MapPin;
  const secondLabel = 'Carte';

  const centerIcon = Shuffle;
  const centerLabel = 'Découvrir';

  const getTabClass = (isActive: boolean, isCenter = false) => {
    if (isCenter) {
      return 'navigation__button navigation__button--center';
    }
    return `navigation__button ${
      isActive ? 'navigation__button--active' : 'navigation__button--inactive'
    }`;
  };

  return (
    <nav className="navigation">
      <div className="navigation__container">
        <div className="navigation__list">
          <button onClick={() => onTabChange('home')} className={getTabClass(activeTab === 'home')}>
            {React.createElement(firstIcon, { className: 'navigation__icon' })}
            <span className="navigation__label">{firstLabel}</span>
          </button>

          <button onClick={() => onTabChange('deck')} className={getTabClass(activeTab === 'deck')}>
            {React.createElement(secondIcon, { className: 'navigation__icon' })}
            <span className="navigation__label">{secondLabel}</span>
          </button>

          <button onClick={() => onTabChange('create')} className={getTabClass(false, true)}>
            {React.createElement(centerIcon, {
              className: 'navigation__icon navigation__icon--center',
            })}
            <span className="navigation__label">{centerLabel}</span>
          </button>

          <button
            onClick={() => onTabChange('messages')}
            className={getTabClass(activeTab === 'messages')}
          >
            <MessageCircle className="navigation__icon" />
            <span className="navigation__label">Messages</span>
          </button>

          <button
            onClick={() => onTabChange('profile')}
            className={getTabClass(activeTab === 'profile')}
          >
            <User className="navigation__icon" />
            <span className="navigation__label">Profil</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
