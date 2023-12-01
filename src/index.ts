import {
    $query,
    $update,
    Record,
    StableBTreeMap,
    Vec,
    match,
    Result,
    nat64,
    ic,
    Opt,
    Principal,
  } from 'azle';
  
  import { v4 as uuidv4 } from 'uuid';
  
  // Define the structure of a quote
  type Quote = Record<{
    id: string;
    authorId: string;
    author: string;
    quote: string;
    created: nat64;
    lastUpdate: Opt<nat64>;
  }>;
  
  // Define the structure of a comment
  type Comment = Record<{
    id: string;
    authorId: string;
    authorName: string;
    quoteId: string;
    comment: string;
    created: nat64;
    lastUpdate: Opt<nat64>;
  }>;
  
  // Define the payload structure for adding a comment
  type CommentPayload = Record<{
    authorId: string;
    authorName: string;
    quoteId: string;
    comment: string;
  }>;
  
  // Define the structure of a user
  type User = Record<{
    id: string;
    name: string;
    pinCode: string;
    created: nat64;
    lastUpdate: Opt<nat64>;
  }>;
  
  // Define the payload structure for creating a new user
  type NewUserPayload = Record<{
    name: string;
    pinCode: string;
  }>;
  
  // Define the payload structure for creating a new quote
  type NewQuotePayload = Record<{
    authorId: string;
    author: string;
    quote: string;
  }>;
  
  // Define the structure of a quote for display purposes
  type QuoteToDisplay = Record<{
    id: string;
    quote: string;
    author: string;
  }>;
  
  // Define the structure of a comment for display purposes
  type CommentsToDisplay = Record<{
    comment: string;
    author: string;
  }>;
  
  // Create storage for quotes, users, and comments
  const quoteStorage = new StableBTreeMap<string, Quote>(0, 44, 1024);
  const userStorage = new StableBTreeMap<string, User>(1, 144, 1024);
  const commentStorage = new StableBTreeMap<string, Comment>(2, 44, 1024);
  
  // Query function to get all quotes
  $query;
  export function getAllQuotes(): Result<Vec<QuoteToDisplay>, string> {
    try {
      return Result.Ok(quoteStorage.values());
    } catch (error) {
      return Result.Err('Error retrieving quotes.');
    }
  }
  
  // Query function to get comments for a specific quote
  $query;
  export function getQuoteComments(quoteId: string): Result<Vec<CommentsToDisplay>, string> {
    try {
      const quoteById = quoteStorage.get(quoteId);
      return match(quoteById, {
        Some: (quote) => {
          const allComments: Comment[] = commentStorage.values();
          const quoteComments: Comment[] = allComments.filter((c: Comment) => c.quoteId === quoteId);
  
          if (quoteComments.length === 0) {
            return Result.Err<Vec<CommentsToDisplay>, string>('No comments found for this quote.');
          }
  
          const commentsToDisplay: CommentsToDisplay[] = quoteComments.map((c: Comment) => ({
            comment: c.comment,
            author: c.authorName,
          }));
  
          return Result.Ok<Vec<CommentsToDisplay>, string>(commentsToDisplay);
        },
        None: () => Result.Err<Vec<CommentsToDisplay>, string>('No quote found with the given ID.'),
      });
    } catch (error) {
      return Result.Err<Vec<CommentsToDisplay>, string>('Error retrieving quote comments.');
    }
  }
  
  // Query function to get user data based on the provided payload
  $query;
  export function getMyUserData(payload: NewUserPayload): Result<User, string> {
    try {
      if (!payload.name || !payload.pinCode) {
        return Result.Err<User, string>('Invalid payload properties for getting user data');
      }
  
      const userData = userStorage.values().find(
        (u: User) => u.name === payload.name && u.pinCode === payload.pinCode
      );
  
      if (userData) {
        return Result.Ok(userData);
      } else {
        return Result.Err<User, string>('No user found with these credentials');
      }
    } catch (error) {
      return Result.Err('Error retrieving user data.');
    }
  }
  
  // Update function to create a new user
  $update;
  export function newUser(payload: NewUserPayload): Result<User, string> {
    try {
      if (!payload.name || !payload.pinCode) {
        return Result.Err<User, string>('Invalid payload properties for creating a new user');
      }
  
      const allUsers: User[] = userStorage.values();
      const checkUserName: User | undefined = allUsers.find((u: User) => u.name === payload.name);
  
      if (checkUserName) return Result.Err('Sorry, this name is already in use...');
  
      const user: User = {
        id: uuidv4(),
        created: ic.time(),
        lastUpdate: Opt.None,
        ...payload,
      };
      userStorage.insert(user.id, user);
      return Result.Ok<User, string>(user);
    } catch (error) {
      return Result.Err('Error creating a new user.');
    }
  }
  
  // Update function to create a new quote
  $update;
  export function newQuote(newUserQuote: NewQuotePayload): Result<Quote, string> {
    try {
      const quote: Quote = {
        id: uuidv4(),
        created: ic.time(),
        lastUpdate: Opt.None,
        ...newUserQuote,
      };
      quoteStorage.insert(quote.id, quote);
      return Result.Ok<Quote, string>(quote);
    } catch (error) {
      return Result.Err('Error creating a new quote.');
    }
  }
  
  // Update function to add a new comment
  $update;
  export function addComment(newComment: CommentPayload): Result<Comment, string> {
    try {
      const commentToAdd: Comment = {
        id: uuidv4(),
        created: ic.time(),
        lastUpdate: Opt.None,
        ...newComment,
      };
      commentStorage.insert(commentToAdd.id, commentToAdd);
      return Result.Ok<Comment, string>(commentToAdd);
    } catch (error) {
      return Result.Err<Comment, string>('Error adding a new comment.');
    }
  }
  
  // Update function to delete a quote
  $update;
  export function deleteQuote(quoteId: string, authorId: string): Result<Quote, string> {
    try {
      if (!quoteId || !authorId) {
        return Result.Err<Quote, string>('Invalid payload properties for deleting a quote');
      }
  
      const ownedQuote = quoteStorage.get(quoteId)?.Some;
  
      if (!ownedQuote || ownedQuote.authorId !== authorId) {
        return Result.Err('You cannot delete the quote because you are not the owner.');
      }
  
      const deleteResult = quoteStorage.remove(quoteId);
  
      return match(deleteResult, {
        Some: (deletedQuote) => {
          const commentsToDelete = commentStorage.values().filter((c) => c.quoteId === quoteId);
  
          commentsToDelete.forEach((c) => deleteComment(quoteId, c.id, authorId));
  
          return Result.Ok<Quote, string>(deletedQuote);
        },
        None: () => Result.Err<Quote, string>('Quote with given Id not found.'),
      });
    } catch (error) {
      return Result.Err('Error deleting a quote.');
    }
  }
  
  // Update function to delete a comment
  $update;
  export function deleteComment(quoteId: string, commentId: string, authorId: string): Result<Comment, string> {
    try {
      if (!quoteId || !commentId || !authorId) {
        return Result.Err<Comment, string>('Invalid payload properties for deleting a comment');
      }
  
      const deleteResult = commentStorage.remove(commentId);
  
      return match(deleteResult, {
        Some: (commentToDelete) => {
          if (commentToDelete.quoteId !== quoteId) {
            return Result.Err<Comment, string>('This comment is not on the given quote.');
          }
          if (commentToDelete.authorId !== authorId) {
            return Result.Err<Comment, string>('Unable to delete the comment, you are not the author.');
          }
  
          return Result.Ok<Comment, string>(commentToDelete);
        },
        None: () => Result.Err<Comment, string>('Comment with given Id not found.'),
      });
    } catch (error) {
      return Result.Err('Error deleting a comment.');
    }
  }
  
  // Update function to delete a user
  $update;
  export function deleteUser(userId: string): Result<User, string> {
    try {
      if (!userId) {
        return Result.Err<User, string>('Invalid payload properties for deleting a user');
      }
  
      const userToDelete = userStorage.remove(userId);
  
      return match(userToDelete, {
        Some: (deletedUser) => {
          const allQuotes: Quote[] = quoteStorage.values();
          const userQuotes: Quote[] = allQuotes.filter((q: Quote) => q.authorId === ic.caller().toString());
  
          userQuotes.forEach((q: Quote) => {
            deleteQuote(q.id, ic.caller().toString());
          });
  
          return Result.Ok<User, string>(deletedUser);
        },
        None: () => Result.Err<User, string>('No user found with those credentials.'),
      });
    } catch (error) {
      return Result.Err('Error deleting a user.');
    }
  }
  
  // A workaround to make uuid package work with Azle
  globalThis.crypto = {
    //@ts-ignore
    getRandomValues: () => {
      let array = new Uint8Array(32);
  
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
  
      return array;
    },
  };
  