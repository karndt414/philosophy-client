// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient'; // Import your client
import './App.css';

function App() {
  const [username, setUsername] = useState('Anonymous');
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [newQuestionTitle, setNewQuestionTitle] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const messagesEndRef = useRef(null);

  // 1. Fetch all questions on component mount
  useEffect(() => {
    async function getQuestions() {
      const { data, error } = await supabase.from('questions').select('*');
      if (error) console.error('Error fetching questions:', error);
      else setQuestions(data);
    }
    getQuestions();
  }, []);

  // 2. Fetch messages when a question is selected
  useEffect(() => {
    if (selectedQuestion) {
      async function getMessages() {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('question_id', selectedQuestion.id)
          .order('created_at', { ascending: true });

        if (error) console.error('Error fetching messages:', error);
        else setMessages(data);
      }
      getMessages();
    }
  }, [selectedQuestion]);

  // 3. Listen for REAL-TIME new messages
  useEffect(() => {
    if (!selectedQuestion) return;

    // Subscribe to new messages on the 'messages' table
    const channel = supabase
      .channel(`question_room_${selectedQuestion.id}`) // A unique channel for this room
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `question_id=eq.${selectedQuestion.id}`, // Only get messages for this question
        },
        (payload) => {
          // A new message has arrived!
          setMessages((prevMessages) => [...prevMessages, payload.new]);
        }
      )
      .subscribe();

    // Cleanup: Unsubscribe when the component unmounts or question changes
    return () => {
      supabase.removeChannel(channel);
    };

  }, [selectedQuestion]);

  // 4. Listen for REAL-TIME new questions (ADD THIS)
  useEffect(() => {
    const channel = supabase
      .channel('all-questions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'questions',
        },
        (payload) => {
          // Add the new question to our list
          setQuestions((prevQuestions) => [...prevQuestions, payload.new]);
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Run this only once when the app loads

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Event Handlers ---

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (newQuestionTitle.trim() === '' || adminPassword.trim() === '') {
      alert('Please fill out all admin fields.');
      return;
    }

    // This calls your 'add-question' Edge Function
    const { data, error } = await supabase.functions.invoke('RealTime', {
      body: {
        title: newQuestionTitle,
        password: adminPassword,
      },
    });

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      // Success! The Realtime listener (step 2) will
      // automatically add the question to the list.
      console.log('New question added:', data);
      setNewQuestionTitle('');
      setAdminPassword('');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !selectedQuestion) return;

    // Send the new message to the Supabase database
    const { error } = await supabase.from('messages').insert({
      question_id: selectedQuestion.id,
      username: username,
      content: newMessage,
    });

    if (error) console.error('Error sending message:', error);

    setNewMessage(''); // Clear the input box
  };

  // --- Render ---
  // (This JSX is almost identical to your old file, so I'm
  // including it for completeness. I just removed the admin form for now.)
  return (
    <div className="App">
      <div className="sidebar">
        <h2>Philosophy Questions</h2>
        <div className="username-input">
          <label>Your Name: </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <form className="admin-form" onSubmit={handleAddQuestion}>
          <h3>Add Question (Admin)</h3>
          <input
            type="text"
            placeholder="New question title"
            value={newQuestionTitle}
            onChange={(e) => setNewQuestionTitle(e.target.value)}
          />
          <input
            type="password"
            placeholder="Admin password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
        <ul>
          {questions.map((q) => (
            <li
              key={q.id}
              className={selectedQuestion?.id === q.id ? 'active' : ''}
              onClick={() => setSelectedQuestion(q)}
            >
              {q.title}
            </li>
          ))}
        </ul>
      </div>

      <div className="chat-room">
        {selectedQuestion ? (
          <>
            <h2>{selectedQuestion.title}</h2>
            <div className="message-list">
              {messages.map((msg) => (
                <div key={msg.id} className="message">
                  <strong>{msg.username}: </strong>
                  <span>{msg.content}</span>
                  <small>{new Date(msg.created_at).toLocaleTimeString()}</small>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form className="message-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your thoughts..."
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="placeholder">
            <h2>Select a question to start chatting</h2>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;