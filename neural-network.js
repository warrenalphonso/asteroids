'use strict';

class NeuralNetwork{
  constructor(numInputs, numHidden, numOutputs){
    this._hidden = [];
    this._inputs = [];
    this._numInputs = numInputs;
    this._numHidden = numHidden;
    this._numOutputs = numOutputs;
    this._weights0 = new Matrix(this._numInputs, this._numHidden);
    this._weights1 = new Matrix(this._numHidden, this._numOutputs);

    //randomise initial weights
    this._weights0.randomWeights();
    this._weights1.randomWeights();
  }

  get hidden(){
    return this._hidden;
  }

  get inputs(){
    return this._inputs;
  }

  get weights0(){
    return this._weights0;
  }

  get weights1(){
    return this._weights1;
  }

  set hidden(hidden){
    this._hidden = hidden;
  }

  set inputs(inputs){
    this._inputs = inputs;
  }

  set weights0(weights){
    this._weights0 = weights;
  }

  set weights1(weights){
    this._weights1 = weights;
  }

  feedForward(inputArray){
    //convert input array to a matrix
    this.inputs = Matrix.convertFromArray(inputArray);

    //find the hidden values and apply activation function
    this.hidden = Matrix.dot(this.inputs, this.weights0);
    this.hidden = Matrix.map(this.hidden, x => sigmoid(x));

    //find the output values and appy the activation function
    let outputs = Matrix.dot(this.hidden, this.weights1);
    outputs = Matrix.map(outputs, x => sigmoid(x));

    return outputs;

    //apply bias
  }

  train(inputArray, targetArray){
    //feed the input data through the network
    let outputs = this.feedForward(inputArray);

    //calculate the output errors (target - output)
    let targets = Matrix.convertFromArray(targetArray);

    let outputErrors = Matrix.subtract(targets, outputs)

    //calculae the delta (errors * derivatives of the output)
    let outputDerivs = Matrix.map(outputs, x => sigmoid(x, true));
    let outputDeltas = Matrix.multiply(outputErrors, outputDerivs);

    //calculate hidden layer errors (delta 'dot' transpose of weights1)
    let weights1T = Matrix.transpose(this.weights1);
    let hiddenErrors = Matrix.dot(outputDeltas, weights1T);

    //calculate the hidden deltas (errors * derivative of hidden)
    let hiddenDerivs = Matrix.map(this.hidden, x => sigmoid(x, true));
    let hiddenDeltas = Matrix.multiply(hiddenErrors, hiddenDerivs);

    //update the weights (add transpose of layers 'dot' deltas)
    let hiddenT = Matrix.transpose(this.hidden);
    this.weigths1 = Matrix.add(this.weights1, Matrix.dot(hiddenT, outputDeltas));
    let inputsT = Matrix.transpose(this.inputs);
    this.weigths0 = Matrix.add(this.weights0, Matrix.dot(inputsT, hiddenDeltas));

    //update bias
  }

}

function sigmoid(x, deriv = false){
  if (deriv){
    return x * (1 - x); //where x = sigmoid(x)
  }
  return 1 / (1 + Math.exp(-x));
}
/***********
*MATRIX FUNCTIONS
************/

class Matrix{
  constructor(rows, cols, data = []){
    this._rows = rows;
    this._cols = cols;
    this._data = data;

    //initialize with zeros if no data provided
    if (data == null || data.length == 0){
      this._data = [];
      for (let i = 0; i < this._rows; i++){
        this._data[i] = [];
        for (let j = 0; j < this._cols; j++){
          this._data[i][j] = 0;
        }
      }
    } else {
      //check data integrity
      if (data.length != rows || data[0].length != cols){
        throw new Error('Incorrect data dimensions!');
      }
    }
  }

  get rows(){
    return this._rows;
  }

  get cols(){
    return this._cols;
  }

  get data(){
    return this._data;
  }

  //add two matrices
  static add(m0, m1){
    Matrix.checkDimensions(m0, m1);
    let m = new Matrix(m0.rows, m0.cols);
    for (let i = 0; i < m.rows; i++){
      for (let j = 0; j < m.cols; j++){
        m.data[i][j] =m0.data[i][j] + m1.data[i][j];
      }
    }
    return m;
  }

  //check matrices have same dimensions
  static checkDimensions(m0, m1){
    if (m0.rows != m1.rows || m0.cols != m1.cols){
      throw new Error('Matrices are of different dimensions')
    }
  }

  //convert array to a one rowed matrix
  static convertFromArray(arr){
    return new Matrix(1, arr.length, [arr]);
  }

  //dot product of two matrices
  static dot(m0, m1){
    if (m0.cols != m1.rows){
      throw new Error('Matrices are not dot compatible');
    }
    let m = new Matrix(m0.rows, m1.cols);
    for (let i = 0; i < m.rows; i++){
      for (let j = 0; j < m.cols; j++){
        let sum = 0;
        for (let k = 0; k < m0.cols; k++){
          sum += m0.data[i][k] * m1.data[k][j];
        }
        m.data[i][j] = sum;
      }
    }
    return m
  }

  //apply a function to each cell of the given matrix
  static map(m0, mFunction){
    let m = new Matrix(m0.rows, m0.cols);
    for (let i = 0; i < m.rows; i++){
      for (let j = 0; j < m.cols; j++){
        m.data[i][j] = mFunction(m0.data[i][j]);
      }
    }
    return m;
  }

  //multiply two matrices; not dot product
  static multiply(m0, m1){
    Matrix.checkDimensions(m0, m1);
    let m = new Matrix(m0.rows, m0.cols);
    for (let i = 0; i < m.rows; i++){
      for (let j = 0; j < m.cols; j++){
        m.data[i][j] =m0.data[i][j] * m1.data[i][j];
      }
    }
    return m;
  }

  //subtract two matrices
  static subtract(m0, m1){
    Matrix.checkDimensions(m0, m1);
    let m = new Matrix(m0.rows, m0.cols);
    for (let i = 0; i < m.rows; i++){
      for (let j = 0; j < m.cols; j++){
        m.data[i][j] =m0.data[i][j] - m1.data[i][j];
      }
    }
    return m;
  }

  //find transpose of matrix
  static transpose(m0){
    let m = new Matrix(m0.cols, m0.rows);
    for (let i = 0; i < m0.rows; i++){
      for (let j = 0; j < m0.cols; j++){
        m.data[j][i] =m0.data[i][j];
      }
    }
    return m;
  }

  //apply random weights between -1 and 1
  randomWeights(){
    for (let i = 0; i < this.rows; i++){
      for (let j = 0; j < this.cols; j++){
        this.data[i][j] = Math.random() * 2 - 1;
      }
    }
  }
}
