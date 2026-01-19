import React from 'react';
import { MessageCircle, Search } from 'lucide-react';

interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  avatar: string;
}

export function MessagesView() {
  const [conversations] = React.useState<Conversation[]>([
    {
      id: '1',
      name: 'Ferme des Trois Vallées',
      lastMessage: 'Les tomates seront prêtes demain matin',
      timestamp: '14:32',
      unread: 2,
      avatar: 'F',
    },
    {
      id: '2',
      name: 'Sophie Martin',
      lastMessage: 'Merci pour la commande groupée !',
      timestamp: 'Hier',
      unread: 0,
      avatar: 'S',
    },
    {
      id: '3',
      name: 'La Chèvrerie du Bois',
      lastMessage: 'Nouvelle production de fromage disponible',
      timestamp: '12/11',
      unread: 1,
      avatar: 'L',
    },
  ]);

  return (
    <div className="space-y-4 pb-6">
      {/* Search */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Rechercher une conversation..."
            className="w-full pl-10 pr-4 py-2 bg-[#F9FAFB] border border-gray-200 rounded-full focus:outline-none focus:border-[#FF6B4A]"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="w-20 h-20 rounded-full bg-[#FFD166]/20 flex items-center justify-center mb-4">
              <MessageCircle className="w-10 h-10 text-[#FFD166]" />
            </div>
            <h3 className="text-[#1F2937] mb-2">Aucune conversation</h3>
            <p className="text-[#6B7280] text-center max-w-sm">
              Vos conversations avec les producteurs et partageurs apparaîtront ici
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className="w-full p-4 hover:bg-[#F9FAFB] transition-colors text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full gradient-card flex items-center justify-center text-white flex-shrink-0">
                    {conversation.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="text-[#1F2937] truncate">{conversation.name}</h3>
                      <span className="text-xs text-[#6B7280] flex-shrink-0 ml-2">
                        {conversation.timestamp}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[#6B7280] truncate">
                        {conversation.lastMessage}
                      </p>
                      {conversation.unread > 0 && (
                        <span className="ml-2 w-6 h-6 bg-[#FF6B4A] text-white text-xs rounded-full flex items-center justify-center flex-shrink-0">
                          {conversation.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
