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
    Opt
} from 'azle';

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto'; // Use a more secure library for random values

type Quote = Record<{
    id: string;
    authorId: string;
    author: string;
    quote: string;
    created: nat64;
    lastUpdate: Opt<nat64>;
}>;

type Comment = Record<{
    id: string;
    authorId: string;
    authorName: string;
    quoteId: string;
    comment: string;
    created: nat64;
    lastUpdate: Opt<nat64>;
}>;

type User = Record<{
    id: string;
    name: string;
    pinCode: string;
    created: nat64;
    lastUpdate: Opt<nat64>;
}>;

type NewUserPayload = Record<{
    name: string;
    pinCode: string;
}>;

type NewQuotePayload = Record<{
    authorId: string;
    quote: string;
}>;

type NewCommentPayload = Record<{
    authorId: string;
    quoteId: string;
    comment: string;
}>;

type QuoteToDisplay = Record<{
    id: string;
    quote: string;
    author: string;
}>;

type CommentsToDisplay = Record<{
    comment: string;
    author: string;
}>;

const quoteStorage = new StableBTreeMap<string, Quote>(0, 44, 1024);
const userStorage = new StableBTreeMap<string, User>(1, 144, 1024);
const commentStorage = new StableBTreeMap<string, Comment>(2, 44, 1024);

// Use a secure library for random values
crypto.getRandomValues = crypto.randomBytes;

// Add better error handling and input validation
function validateUserInput(payload: NewUserPayload): Result<void, string> {
    if (!payload.name || !payload.pinCode) {
        return Result.Err('Invalid input: name and pinCode are required.');
    }
    return Result.Ok(undefined);
}

function validateQuoteInput(newUserQuote: NewQuotePayload, allUsers: User[]): Result<void, string> {
    const userThatComments = allUsers.find((u: User) => u.id === newUserQuote.authorId);
    if (!userThatComments) {
        return Result.Err('Author with given ID not found.');
    }
    return Result.Ok(undefined);
}

function validateCommentInput(newComment: NewCommentPayload, allUsers: User[]): Result<void, string> {
    const userThatComments = allUsers.find((u: User) => u.id === newComment.authorId);
    if (!userThatComments) {
        return Result.Err('Author with given ID not found.');
    }
    return Result.Ok(undefined);
}

$query
export function getAllQuotes(): Result<Vec<QuoteToDisplay>, string> {
    const allQuotes: Quote[] = quoteStorage.values();

    if (allQuotes.length === 0) return Result.Err('At the moment there is no quote...');

    const quoteToReturn: QuoteToDisplay[] = allQuotes.map((singleQuote: Quote) => ({
        id: singleQuote.id,
        quote: singleQuote.quote,
        author: singleQuote.author,
    }));
    return Result.Ok<Vec<QuoteToDisplay>, string>(quoteToReturn);
}

$query
export function getQuoteComments(quoteId: string): Result<Vec<CommentsToDisplay>, string> {
    const allQuotes: Quote[] = quoteStorage.values();
    const quoteById: Quote | undefined = allQuotes.find((q: Quote) => q.id === quoteId);

    if (!quoteById) return Result.Err('No quote found with the given ID.');

    const allComments: Comment[] = commentStorage.values();
    const quoteComments: Comment[] = allComments.filter((c: Comment) => c.quoteId === quoteId);

    if (quoteComments.length === 0) return Result.Err('No comments found for this quote.');

    const commentsToDisplay: CommentsToDisplay[] = quoteComments.map((c: Comment) => ({
        comment: c.comment,
        author: c.authorName,
    }));

    return Result.Ok<Vec<CommentsToDisplay>, string>(commentsToDisplay);
}

$query
export function getMyUserData(payload: NewUserPayload): Result<User, string> {
    const allUsers: User[] = userStorage.values();
    const userData: User | undefined = allUsers.find(
        (u: User) => u.name === payload.name && u.pinCode === payload.pinCode
    );

    if (!userData) return Result.Err('No user found with these credentials');

    return Result.Ok<User, string>(userData);
}

$update
export function newUser(payload: NewUserPayload): Result<User, string> {
    const validation = validateUserInput(payload);
    if (validation.isErr()) {
        return Result.Err(validation.error);
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
    userStorage.insert(user.id + user.pinCode, user);
    return Result.Ok<User, string>(user);
}

$update
export function newQuote(newUserQuote: NewQuotePayload): Result<Quote, string> {
    const allUsers: User[] = userStorage.values();
    const validation = validateQuoteInput(newUserQuote, allUsers);
    if (validation.isErr()) {
        return Result.Err(validation.error);
    }

    const userThatComments: User | undefined = allUsers.find((u: User) => u.id === newUserQuote.authorId);

    if (!userThatComments) return Result.Err('Author with given ID not found.');

    const quote: Quote = {
        id: uuidv4(),
        created: ic.time(),
        lastUpdate: Opt.None,
        author: userThatComments.name,
        ...newUserQuote,
    };
    quoteStorage.insert(quote.id, quote);
    return Result.Ok<Quote, string>(quote);
}

$update
export function addComment(newComment: NewCommentPayload): Result<Comment, string> {
    const allUsers: User[] = userStorage.values();
    const validation = validateCommentInput(newComment, allUsers);
    if (validation.isErr()) {
        return Result.Err(validation.error);
    }

    const userThatComments: User | undefined = allUsers.find((u: User) => u.id === newComment.authorId);

    if (!userThatComments) return Result.Err('Author with given ID not found.');

    const commentToAdd: Comment = {
        id: uuidv4(),
        authorName: userThatComments.name,
        created: ic.time(),
        lastUpdate: Opt.None,
        ...newComment,
    };
    commentStorage.insert(commentToAdd.id, commentToAdd);

    return Result.Ok<Comment, string>(commentToAdd);
}

$update
export function deleteQuote(quoteId: string, authorId: string):
Result<Quote, string> {
    const allQuotes: Quote[] = quoteStorage.values();
    const ownedQuote: Quote | undefined = allQuotes.find((q: Quote) => q.id === quoteId && q.authorId === authorId);

    if (!ownedQuote) return Result.Err('You cannot delete the quote because you are not the owner.');

    const deleteResult = quoteStorage.remove(quoteId);

    return match(deleteResult, {
        Some: (deletedQuote: Quote) => {
            const allComments: Comment[] = commentStorage.values();
            const commentsToDelete: Comment[] = allComments.filter((c: Comment) => c.quoteId === quoteId);

            if (commentsToDelete.length !== 0) {
                commentsToDelete.forEach((c: Comment) => deleteComment(quoteId, c.id, authorId));
            }

            return Result.Ok<Quote, string>(deletedQuote);
        },
        None: () => Result.Err<Quote, string>('Quote with given Id not found.'),
    });
}

$update
export function deleteComment(quoteId: string, commentId: string, authorId: string): Result<Comment, string> {
    const deleteResult = commentStorage.remove(commentId);

    return match(deleteResult, {
        Some: (commentToDelete: Comment) => {
            if (commentToDelete.quoteId !== quoteId) return Result.Err<Comment, string>('This comment is not on the given quote.');
            if (commentToDelete.authorId !== authorId) return Result.Err<Comment, string>('Unable to delete the comment, you are not the author.');

            return Result.Ok<Comment, string>(commentToDelete);
        },
        None: () => Result.Err<Comment, string>('Comment with given Id not found.'),
    });
}

$update
export function deleteUser(userId: string, pinCode: string): Result<User, string> {
    const allUsers: User[] = userStorage.values();
    const userById: User | undefined = allUsers.find((u: User) => u.id === userId);

    if (!userById || userById.pinCode !== pinCode) return Result.Err<User, string>('Unable to delete user, wrong credentials.');

    const deleteResult = userStorage.remove(userId + pinCode);

    return match(deleteResult, {
        Some: (userToDelete: User) => {
            const allQuotes: Quote[] = quoteStorage.values();
            const userQuotes: Quote[] = allQuotes.filter((q: Quote) => q.authorId === userId);

            if (userQuotes.length !== 0) {
                userQuotes.forEach((q: Quote) => {
                    deleteQuote(q.id, userId);
                });
            }

            return Result.Ok<User, string>(userToDelete);
        },
        None: () => Result.Err<User, string>('No user found with those credentials.'),
    });
}
